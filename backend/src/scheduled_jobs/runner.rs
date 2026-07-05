use std::sync::Arc;

use serde_json::json;
use uuid::Uuid;

use crate::agent::{AgentEvent, AgentStatus};
use crate::AppState;

use super::active_runs::ActiveScheduledRun;
use super::agent_loop::{run_to_completion, AgentLoopInput};
use super::provider::{resolve_model, resolve_provider, resolve_workspace_dir};
use super::store::{
    finish_job_run, get_job, patch_message, put_message, put_session, start_job_run,
};
use super::system_prompt::{build_system_prompt, derive_session_title};
use super::types::{RunStatus, ScheduledJobRecord};

pub fn queue_job_run(state: Arc<AppState>, job: ScheduledJobRecord) {
    if !state.scheduled_job_lock.try_acquire(&job.id) {
        return;
    }

    let state_for_task = state.clone();
    let job_id = job.id.clone();
    tokio::spawn(async move {
        let result = execute_job(state_for_task.clone(), job).await;
        if let Err(error) = result {
            log::error!("[scheduled_jobs] job {job_id} failed: {error}");
        }
        state_for_task.scheduled_job_lock.release(&job_id);
    });
}

pub async fn run_job_by_id(state: Arc<AppState>, job_id: &str) -> Result<(), String> {
    let job = get_job(&state.db, job_id)?
        .ok_or_else(|| format!("Scheduled job not found: {job_id}"))?;
    queue_job_run(state, job);
    Ok(())
}

fn patch_message_from_event(
    db: &Arc<std::sync::Mutex<crate::db::Database>>,
    assistant_message_id: &str,
    event: &AgentEvent,
) {
    match event {
        AgentEvent::ContentDelta { delta, .. } => {
            let _ = patch_message(db, assistant_message_id, Some(delta.as_str()), None, None);
        }
        AgentEvent::ThinkingDelta { delta, .. } => {
            let _ = patch_message(db, assistant_message_id, None, Some(delta.as_str()), None);
        }
        AgentEvent::Status { status, .. } => {
            let next_status = match status {
                AgentStatus::Pending => "pending",
                AgentStatus::Running => "streaming",
                AgentStatus::Cancelling => "streaming",
                AgentStatus::Completed => "completed",
                AgentStatus::Failed => "failed",
                AgentStatus::Cancelled => "cancelled",
            };
            let _ = patch_message(db, assistant_message_id, None, None, Some(next_status));
        }
        AgentEvent::Error { message, .. } => {
            let _ = patch_message(db, assistant_message_id, None, None, Some("failed"));
            if let Ok(Some(mut record)) = super::store::get_message(db, assistant_message_id) {
                record["error"] = json!(message);
                let _ = put_message(db, &record);
            }
        }
        _ => {}
    }
}

async fn execute_job(state: Arc<AppState>, job: ScheduledJobRecord) -> Result<(), String> {
    let session_id = Uuid::new_v4().to_string();
    let assistant_message_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let provider = resolve_provider(&job.provider)?;
    let model = resolve_model(&job.model, &provider);
    let workspace_dir = resolve_workspace_dir(
        job.workspace_dir.as_deref(),
        &state.workspace_dir,
    );
    let session_title = derive_session_title(&job.prompt, 48);
    put_session(
        &state.db,
        &json!({
            "id": session_id,
            "title": session_title,
            "model": model,
            "provider": provider.provider,
            "workspaceDir": workspace_dir,
            "sessionKind": "automation",
            "autonomyMode": "unattended",
            "decisionPolicyVersion": "mvp-v1",
            "decisionModel": null,
            "parentSessionId": null,
            "handoffFromSessionId": null,
            "handoffMessageId": null,
            "planFileName": null,
            "planBuiltAt": null,
            "enableEmail": job.enable_email,
            "pinnedAt": null,
            "createdAt": now,
            "updatedAt": now,
        }),
        &session_id,
        now,
    )?;

    let user_message_id = Uuid::new_v4().to_string();
    put_message(
        &state.db,
        &json!({
            "id": user_message_id,
            "sessionId": session_id,
            "role": "user",
            "content": job.prompt,
            "thinking": "",
            "toolInvocations": [],
            "status": "completed",
            "taskId": null,
            "error": null,
            "createdAt": now,
        }),
    )?;

    put_message(
        &state.db,
        &json!({
            "id": assistant_message_id,
            "sessionId": session_id,
            "role": "assistant",
            "content": "",
            "thinking": "",
            "toolInvocations": [],
            "status": "pending",
            "taskId": session_id,
            "error": null,
            "createdAt": now,
        }),
    )?;

    start_job_run(&state.db, &job.id, &session_id)?;

    state.scheduled_job_active_runs.register(ActiveScheduledRun {
        job_id: job.id.clone(),
        session_id: session_id.clone(),
        assistant_message_id: assistant_message_id.clone(),
        task_id: session_id.clone(),
    });

    let db = state.db.clone();
    let assistant_id_for_events = assistant_message_id.clone();
    let on_agent_event: Arc<dyn Fn(AgentEvent) + Send + Sync> =
        Arc::new(move |event: AgentEvent| {
            patch_message_from_event(&db, &assistant_id_for_events, &event);
        });

    let system_prompt = build_system_prompt(workspace_dir.as_deref(), &job.agent_mode);
    let loop_result = run_to_completion(
        &state.agent_registry,
        AgentLoopInput {
            provider: &provider,
            model: &model,
            agent_mode: &job.agent_mode,
            enable_email: job.enable_email,
            workspace_dir: workspace_dir.as_deref(),
            session_id: &session_id,
            system_prompt: &system_prompt,
            user_prompt: &job.prompt,
            http_base_url: &state.http_base_url,
            sse_broadcaster: Some(state.sse_broadcaster.clone()),
            on_agent_event: Some(on_agent_event),
        },
    )
    .await;

    state
        .scheduled_job_active_runs
        .unregister(&job.id);

    match loop_result {
        Ok((content, _thinking)) => {
            let summary = if content.trim().is_empty() {
                "[completed]".to_string()
            } else {
                content
                    .chars()
                    .take(200)
                    .collect::<String>()
                    .replace('\n', " ")
            };

            finish_job_run(
                &state.db,
                &job.id,
                &session_id,
                summary,
                RunStatus::Completed,
            )?;
            Ok(())
        }
        Err(error) => {
            if let Ok(Some(mut message)) = super::store::get_message(&state.db, &assistant_message_id)
            {
                message["error"] = json!(error);
                message["status"] = json!("failed");
                let _ = put_message(&state.db, &message);
            }

            let summary = format!("[failed] {}", error.chars().take(200).collect::<String>());
            finish_job_run(
                &state.db,
                &job.id,
                &session_id,
                summary,
                RunStatus::Failed,
            )?;
            Err(error)
        }
    }
}
