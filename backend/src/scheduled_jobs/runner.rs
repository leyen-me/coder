use std::sync::Arc;
use std::time::Duration;

use tokio::sync::broadcast;

use crate::db::session_store::get_message;
use crate::AppState;

use super::active_runs::ActiveScheduledRun;
use super::provider::resolve_job_runtime;
use super::store::{finish_job_run, get_job, start_job_run};
use super::types::{RunStatus, ScheduledJobRecord};

const AUTOMATION_SESSION_TITLE_PREFIX: &str = "自动化 · ";

pub fn queue_job_run(state: Arc<AppState>, job: ScheduledJobRecord) -> bool {
    if !state.scheduled_job_lock.try_acquire(&job.id) {
        return false;
    }

    tokio::spawn(async move {
        if let Err(error) = execute_job(state.clone(), job.clone()).await {
            log::error!("[scheduled_jobs] job {} failed to start: {}", job.id, error);
            state.scheduled_job_lock.release(&job.id);
        }
    });
    true
}

pub async fn run_job_by_id(state: Arc<AppState>, job_id: &str) -> Result<bool, String> {
    let job = get_job(&state.db, job_id)?
        .ok_or_else(|| format!("Scheduled job not found: {job_id}"))?;
    Ok(queue_job_run(state, job))
}

async fn execute_job(state: Arc<AppState>, job: ScheduledJobRecord) -> Result<(), String> {
    let runtime = resolve_job_runtime(&job.provider, &job.model, job.thinking_enabled)?;
    let workspace_dir = resolve_workspace_dir(job.workspace_dir.as_deref(), &state);

    // Spawn the session via the unified entry point (Q8: merge with SubAgent).
    // spawn_session creates the SessionRecord + sends the user message + starts
    // the agent loop — identical to a normal session, no Automation-specific
    // execution logic.
    let spawn_result = crate::agent::spawn::spawn_session(
        state.clone(),
        crate::agent::spawn::SpawnSessionOptions {
            parent_session_id: None,
            task: job.prompt.clone(),
            model: job.model.trim().to_string(),
            workspace_dir,
            base_url: runtime.base_url,
            api_key: runtime.api_key,
            api_key_source: Some(runtime.api_key_source),
            api_key_env_var: Some(runtime.api_key_env_var),
            request_extensions: runtime.request_extensions,
            max_context_tokens: Some(runtime.max_context_tokens),
            compact_trigger_threshold: None,
            agent_mode: Some(match job.agent_mode {
                super::types::AgentMode::Agent => "agent".to_string(),
                super::types::AgentMode::Ask => "ask".to_string(),
            }),
            thinking_enabled: Some(job.thinking_enabled),
            extra_tools: None,
            denied_tools: None,
            autonomy_mode: None,
            decision_policy_version: None,
            decision_model: None,
        },
    )
    .await?;

    let session_id = spawn_result.session_id.clone();
    let task_id = spawn_result.task_id.clone();

    // Apply the "自动化 · " title prefix on top of the derived title.
    // spawn_session derived the base title from the prompt via
    // derive_session_title (same as a normal session); Automation adds its
    // business prefix afterward.
    let session_title = derive_automation_session_title(&job, 48);
    {
        let db = state
            .db
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;
        let _ = crate::db::session_store::update_session(&db, &session_id, |record| {
            record.title = session_title.clone();
        });
    }

    start_job_run(&state.db, &job.id, &task_id, &session_id)?;
    let receiver = state.sse_broadcaster.subscribe(&task_id);
    log::info!(
        "[scheduled_jobs] job_start job_id={} task_id={} session_id={} title={:?} model={} agent_mode={:?} cron={:?}",
        job.id,
        task_id,
        session_id,
        session_title,
        job.model,
        job.agent_mode,
        job.cron_expression
    );

    let active_run = ActiveScheduledRun {
        job_id: job.id.clone(),
        session_id,
        assistant_message_id: spawn_result.assistant_message_id,
        task_id,
    };
    state
        .scheduled_job_active_runs
        .register(active_run.clone());

    tokio::spawn(watch_job_run(state, active_run, receiver));
    Ok(())
}

async fn watch_job_run(
    state: Arc<AppState>,
    run: ActiveScheduledRun,
    mut receiver: broadcast::Receiver<String>,
) {
    let outcome = {
        loop {
            match read_terminal_run_outcome(&state, &run.assistant_message_id) {
                Ok(Some(outcome)) => break outcome,
                Ok(None) => {}
                Err(error) => {
                    break (RunStatus::Failed, format_failed_summary(&error));
                }
            }

            match tokio::time::timeout(Duration::from_secs(5), receiver.recv()).await {
                Ok(Ok(payload)) => {
                    if terminal_status_from_event(&payload).is_some() {
                        continue;
                    }
                }
                Ok(Err(broadcast::error::RecvError::Lagged(_))) => continue,
                Ok(Err(broadcast::error::RecvError::Closed)) => break (
                    RunStatus::Failed,
                    "[failed] Run stream closed unexpectedly".to_string(),
                ),
                Err(_) => continue,
            }
        }
    };

    log::info!(
        "[scheduled_jobs] job_finish job_id={} task_id={} session_id={} status={:?} summary={:?}",
        run.job_id,
        run.task_id,
        run.session_id,
        outcome.0,
        outcome.1
    );
    if let Err(error) = finish_job_run(&state.db, &run.job_id, &run.task_id, outcome.1, outcome.0) {
        log::error!(
            "[scheduled_jobs] failed to finalize run {} for job {}: {}",
            run.task_id,
            run.job_id,
            error
        );
    }
    state.scheduled_job_active_runs.unregister(&run.job_id);
    state.scheduled_job_lock.release(&run.job_id);
}

fn read_terminal_run_outcome(
    state: &AppState,
    assistant_message_id: &str,
) -> Result<Option<(RunStatus, String)>, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())?;
    let Some(message) = get_message(&db, assistant_message_id)? else {
        return Ok(None);
    };
    let Some(status) = message_status(&message.status) else {
        return Ok(None);
    };
    Ok(Some((status.clone(), summarize_message(&message.content, message.error.as_deref(), &status))))
}

fn message_status(status: &str) -> Option<RunStatus> {
    match status.trim() {
        "completed" => Some(RunStatus::Completed),
        "failed" => Some(RunStatus::Failed),
        "cancelled" => Some(RunStatus::Cancelled),
        _ => None,
    }
}

fn summarize_message(content: &str, error: Option<&str>, status: &RunStatus) -> String {
    let content_preview = normalize_summary_text(content);
    match status {
        RunStatus::Completed => {
            if content_preview.is_empty() {
                "[completed]".to_string()
            } else {
                content_preview
            }
        }
        RunStatus::Cancelled => {
            if content_preview.is_empty() {
                "[cancelled]".to_string()
            } else {
                content_preview
            }
        }
        RunStatus::Failed => {
            let message = error
                .map(normalize_summary_text)
                .filter(|value| !value.is_empty())
                .unwrap_or(content_preview);
            if message.is_empty() {
                "[failed]".to_string()
            } else {
                format!("[failed] {message}")
            }
        }
        RunStatus::Running => "[running]".to_string(),
    }
}

fn normalize_summary_text(text: &str) -> String {
    let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
    normalized.chars().take(200).collect()
}

fn format_failed_summary(message: &str) -> String {
    let preview = normalize_summary_text(message);
    if preview.is_empty() {
        "[failed]".to_string()
    } else {
        format!("[failed] {preview}")
    }
}

fn resolve_workspace_dir(requested: Option<&str>, state: &AppState) -> Option<String> {
    requested
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| {
            let fallback = state.workspace_dir.to_string_lossy().trim().to_string();
            (!fallback.is_empty()).then_some(fallback)
        })
}

fn derive_session_title(text: &str, max_length: usize) -> String {
    let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.chars().count() <= max_length {
        return normalized;
    }
    format!(
        "{}…",
        normalized
            .chars()
            .take(max_length.saturating_sub(1))
            .collect::<String>()
    )
}

fn derive_automation_session_title(job: &ScheduledJobRecord, max_length: usize) -> String {
    let prefix_len = AUTOMATION_SESSION_TITLE_PREFIX.chars().count();
    let base = if job.name.trim().is_empty() {
        derive_session_title(&job.prompt, max_length.saturating_sub(prefix_len))
    } else {
        derive_session_title(job.name.trim(), max_length.saturating_sub(prefix_len))
    };
    format!("{AUTOMATION_SESSION_TITLE_PREFIX}{base}")
}

fn terminal_status_from_event(payload: &str) -> Option<RunStatus> {
    let parsed = serde_json::from_str::<serde_json::Value>(payload).ok()?;
    if parsed.get("type").and_then(serde_json::Value::as_str) != Some("status") {
        return None;
    }
    message_status(parsed.get("status").and_then(serde_json::Value::as_str).unwrap_or_default())
}
