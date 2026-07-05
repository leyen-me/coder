use std::sync::Arc;

use serde_json::json;
use uuid::Uuid;

use crate::AppState;

use super::agent_loop::{run_to_completion, AgentLoopInput};
use super::provider::{resolve_model, resolve_provider, resolve_workspace_dir};
use super::store::{finish_job_run, get_job, put_message, put_session, start_job_run};
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

async fn execute_job(state: Arc<AppState>, job: ScheduledJobRecord) -> Result<(), String> {
    let session_id = Uuid::new_v4().to_string();
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

    start_job_run(&state.db, &job.id, &session_id)?;

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
        },
    )
    .await;

    match loop_result {
        Ok((content, thinking)) => {
            let assistant_message_id = Uuid::new_v4().to_string();
            let completed_at = chrono::Utc::now().timestamp_millis();
            put_message(
                &state.db,
                &json!({
                    "id": assistant_message_id,
                    "sessionId": session_id,
                    "role": "assistant",
                    "content": content,
                    "thinking": thinking,
                    "toolInvocations": [],
                    "status": "completed",
                    "taskId": session_id,
                    "error": null,
                    "createdAt": completed_at,
                }),
            )?;

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
