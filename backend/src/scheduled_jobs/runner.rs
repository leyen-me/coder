use std::sync::Arc;
use std::time::Duration;

use tokio::sync::broadcast;

use crate::db::{
    records::{current_timestamp_ms, SessionRecord},
    session_store::{get_message, new_session_id, put_session},
};
use crate::http::routes_tool::{start_agent_send_with_task_id, AgentSendParams};
use crate::AppState;

use super::active_runs::ActiveScheduledRun;
use super::provider::resolve_job_runtime;
use super::store::{finish_job_run, get_job, start_job_run};
use super::types::{RunStatus, ScheduledJobRecord};

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
    let session_id = new_session_id();
    let task_id = uuid::Uuid::new_v4().to_string();
    let workspace_dir = resolve_workspace_dir(job.workspace_dir.as_deref(), &state);
    let now = current_timestamp_ms();
    let session = SessionRecord {
        id: session_id.clone(),
        title: if job.name.trim().is_empty() {
            derive_session_title(&job.prompt, 48)
        } else {
            job.name.trim().to_string()
        },
        model: job.model.trim().to_string(),
        provider: runtime.provider.clone(),
        workspace_dir: workspace_dir.clone(),
        session_kind: "standard".to_string(),
        autonomy_mode: "interactive".to_string(),
        decision_policy_version: "mvp-v1".to_string(),
        decision_model: None,
        parent_session_id: None,
        handoff_from_session_id: None,
        handoff_message_id: None,
        handoff_phase: None,
        plan_file_name: None,
        plan_built_at: None,
        context_usage_snapshot: None,
        pinned_at: None,
        created_at: now,
        updated_at: now,
    };

    {
        let db = state
            .db
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;
        put_session(&db, &session)?;
    }

    start_job_run(&state.db, &job.id, &task_id, &session_id)?;
    let receiver = state.sse_broadcaster.subscribe(&task_id);

    let response = start_agent_send_with_task_id(
        state.clone(),
        AgentSendParams {
            session_id: session_id.clone(),
            content: job.prompt.clone(),
            images: None,
            edit_message_id: None,
            referenced_skills: None,
            base_url: runtime.base_url,
            api_key: runtime.api_key,
            api_key_source: Some(runtime.api_key_source),
            api_key_env_var: Some(runtime.api_key_env_var),
            model: job.model.clone(),
            request_extensions: runtime.request_extensions,
            max_context_tokens: Some(runtime.max_context_tokens),
            handoff_trigger_threshold: None,
            agent_mode: Some(match job.agent_mode {
                super::types::AgentMode::Agent => "agent".to_string(),
                super::types::AgentMode::Ask => "ask".to_string(),
            }),
            thinking_enabled: Some(job.thinking_enabled),
            models: None,
            extra_tools: None,
        },
        task_id.clone(),
    )
    .await
    .map_err(|(_, message)| message);

    let response = match response {
        Ok(value) => value,
        Err(error) => {
            let _ = finish_job_run(
                &state.db,
                &job.id,
                &task_id,
                format_failed_summary(&error),
                RunStatus::Failed,
            );
            return Err(error);
        }
    };

    let active_run = ActiveScheduledRun {
        job_id: job.id.clone(),
        session_id,
        assistant_message_id: response.assistant_message_id,
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

fn terminal_status_from_event(payload: &str) -> Option<RunStatus> {
    let parsed = serde_json::from_str::<serde_json::Value>(payload).ok()?;
    if parsed.get("type").and_then(serde_json::Value::as_str) != Some("status") {
        return None;
    }
    message_status(parsed.get("status").and_then(serde_json::Value::as_str).unwrap_or_default())
}
