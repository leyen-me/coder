use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use reqwest::Client;
use serde_json::Value;
use tokio_util::sync::CancellationToken;

use super::event_log::EventLog;
use super::loop_::{run_agent_loop, AgentLoopError};
use super::openai::{
    build_http_client, chat_completions_url, complete_chat_completion, REFINE_PROMPT_MAX_TOKENS,
    SESSION_TITLE_MAX_TOKENS, SESSION_TITLE_SYSTEM_PROMPT,
};
use super::stream_log::{agent_diagnostic_log, agent_stream_log};
use super::types::{
    AgentEvent, AgentStartParams, AgentStatus, AgentStatusResponse, ChatMessage,
    GenerateSessionTitleParams, RefinePromptParams,
};
use crate::db::{
    records::current_timestamp_ms,
    session_store::{find_assistant_message_by_task_id, update_message},
};

fn debug_emit_log(event: &AgentEvent) {
    if !cfg!(debug_assertions) {
        return;
    }

    match event {
        AgentEvent::Status { task_id, status } => {
            agent_stream_log(format!(
                "emit task_id={task_id} type=status status={status:?}"
            ));
        }
        AgentEvent::ThinkingDelta { task_id, delta } => {
            let preview: String = delta.chars().take(120).collect();
            let suffix = if delta.chars().count() > 120 {
                "..."
            } else {
                ""
            };
            let preview_text = format!("{preview}{suffix}");
            agent_stream_log(format!(
                "emit task_id={task_id} type=thinking len={} preview={preview_text:?}",
                delta.len()
            ));
        }
        AgentEvent::ContentDelta { task_id, delta } => {
            let preview: String = delta.chars().take(120).collect();
            let suffix = if delta.chars().count() > 120 {
                "..."
            } else {
                ""
            };
            let preview_text = format!("{preview}{suffix}");
            agent_stream_log(format!(
                "emit task_id={task_id} type=content len={} preview={preview_text:?}",
                delta.len()
            ));
        }
        AgentEvent::ToolCallPending {
            task_id,
            tool_call_id,
            name,
        } => {
            agent_stream_log(format!(
                "emit task_id={task_id} type=tool_call_pending id={tool_call_id} name={name:?}"
            ));
        }
        AgentEvent::ToolCallStarted {
            task_id,
            tool_call_id,
            name,
            ..
        } => {
            agent_stream_log(format!(
                "emit task_id={task_id} type=tool_call_started id={tool_call_id} name={name:?}"
            ));
        }
        AgentEvent::ToolCallFinished {
            task_id,
            tool_call_id,
            ..
        } => {
            agent_stream_log(format!(
                "emit task_id={task_id} type=tool_call_finished id={tool_call_id}"
            ));
        }
        AgentEvent::TurnComplete {
            task_id,
            tool_calls,
        } => {
            agent_stream_log(format!(
                "emit task_id={task_id} type=turn_complete tool_calls={}",
                tool_calls.len()
            ));
        }
        AgentEvent::Done { task_id, .. } => {
            agent_stream_log(format!("emit task_id={task_id} type=done"));
        }
        AgentEvent::HandoffRequired { task_id, .. } => {
            agent_stream_log(format!("emit task_id={task_id} type=handoff_required"));
        }
        AgentEvent::HandoffProgress {
            task_id,
            session_id,
            phase,
        } => {
            agent_stream_log(format!(
                "emit task_id={task_id} type=handoff_progress session_id={session_id} phase={phase}"
            ));
        }
        AgentEvent::HandoffComplete {
            task_id,
            source_session_id,
            continued_session_id,
        } => {
            agent_stream_log(format!(
                "emit task_id={task_id} type=handoff_complete source_session_id={source_session_id} continued_session_id={continued_session_id}"
            ));
        }
        AgentEvent::DecisionRequested {
            task_id,
            decision_id,
            ..
        } => {
            agent_stream_log(format!(
                "emit task_id={task_id} type=decision_requested decision_id={decision_id}"
            ));
        }
        AgentEvent::DecisionResolved {
            task_id,
            decision_id,
            ..
        } => {
            agent_stream_log(format!(
                "emit task_id={task_id} type=decision_resolved decision_id={decision_id}"
            ));
        }
        AgentEvent::ChatRetry {
            task_id,
            attempt,
            max_attempts,
        } => {
            agent_stream_log(format!(
                "emit task_id={task_id} type=chat_retry attempt={attempt}/{max_attempts}"
            ));
        }
        AgentEvent::Error { task_id, message } => {
            agent_stream_log(format!(
                "emit task_id={task_id} type=error message={message:?}"
            ));
        }
    }
}

struct AgentRun {
    status: AgentStatus,
    session_id: Option<String>,
    cancel: CancellationToken,
    event_log: EventLog,
}

pub struct AgentRegistry {
    client: Client,
    runs: HashMap<String, AgentRun>,
}

impl AgentRegistry {
    pub fn new() -> Result<Self, String> {
        Ok(Self {
            client: build_http_client()?,
            runs: HashMap::new(),
        })
    }

    pub fn get_status(&self, task_id: &str) -> Option<AgentStatusResponse> {
        self.runs.get(task_id).map(|run| AgentStatusResponse {
            task_id: task_id.to_string(),
            status: run.status.clone(),
            last_seq: Some(run.event_log.latest_seq()),
        })
    }

    pub fn http_client(&self) -> Client {
        self.client.clone()
    }

    pub fn record_event(&mut self, task_id: &str, event_json: &str) -> u64 {
        self.runs
            .get_mut(task_id)
            .map(|run| run.event_log.push(event_json))
            .unwrap_or(0)
    }

    pub fn update_status(&mut self, task_id: &str, status: AgentStatus) {
        if let Some(run) = self.runs.get_mut(task_id) {
            run.status = status;
        }
    }

    pub fn remove_run(&mut self, task_id: &str) {
        self.runs.remove(task_id);
    }

    pub fn replay_events_from(&self, task_id: &str, from_seq: u64) -> Vec<String> {
        self.runs
            .get(task_id)
            .map(|run| run.event_log.replay_from(from_seq))
            .unwrap_or_default()
    }

    pub fn get_session_status(&self, session_id: &str) -> Option<AgentStatusResponse> {
        self.runs
            .iter()
            .find(|(_, run)| run.session_id.as_deref() == Some(session_id) && is_active_run_status(&run.status))
            .map(|(task_id, run)| AgentStatusResponse {
                task_id: task_id.clone(),
                status: run.status.clone(),
                last_seq: Some(run.event_log.latest_seq()),
            })
    }
}

pub async fn generate_session_title(
    client: &Client,
    params: GenerateSessionTitleParams,
) -> Result<Option<String>, String> {
    let api_key = resolve_api_key(
        params.api_key_source.as_str(),
        params.api_key.as_deref(),
        params.api_key_env_var.as_str(),
    )?;

    if params.base_url.trim().is_empty() {
        return Err("Base URL is required".to_string());
    }

    if params.model.trim().is_empty() {
        return Err("Model is required".to_string());
    }

    let user_message = params.user_message.trim();
    if user_message.is_empty() {
        return Ok(None);
    }

    let user_prompt =
        format!("Summarize this chat session based on the user's first message:\n\n{user_message}");

    let messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: Some(Value::String(SESSION_TITLE_SYSTEM_PROMPT.to_string())),
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: None,
            name: None,
        },
        ChatMessage {
            role: "user".to_string(),
            content: Some(Value::String(user_prompt)),
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: None,
            name: None,
        },
    ];

    let url = chat_completions_url(&params.base_url);
    complete_chat_completion(
        client,
        url,
        &api_key,
        params.model.trim(),
        &messages,
        SESSION_TITLE_MAX_TOKENS,
    )
    .await
}

pub async fn refine_prompt(
    client: &Client,
    params: RefinePromptParams,
) -> Result<Option<String>, String> {
    let api_key = resolve_api_key(
        params.api_key_source.as_str(),
        params.api_key.as_deref(),
        params.api_key_env_var.as_str(),
    )?;

    if params.base_url.trim().is_empty() {
        return Err("Base URL is required".to_string());
    }

    if params.model.trim().is_empty() {
        return Err("Model is required".to_string());
    }

    let user_prompt = params.user_prompt.trim();
    if user_prompt.is_empty() {
        return Ok(None);
    }

    let system_prompt = params.system_prompt.trim();
    if system_prompt.is_empty() {
        return Err("System prompt is required".to_string());
    }

    let user_content = if params.context_messages.is_empty() {
        format!("User prompt:\n{user_prompt}")
    } else {
        let context_block = params
            .context_messages
            .iter()
            .map(|message| format!("{}: {}", message.role, message.content))
            .collect::<Vec<_>>()
            .join("\n\n");
        format!("Conversation context:\n{context_block}\n\nUser prompt:\n{user_prompt}")
    };

    let messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: Some(Value::String(system_prompt.to_string())),
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: None,
            name: None,
        },
        ChatMessage {
            role: "user".to_string(),
            content: Some(Value::String(user_content)),
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: None,
            name: None,
        },
    ];

    let url = chat_completions_url(&params.base_url);
    complete_chat_completion(
        client,
        url,
        &api_key,
        params.model.trim(),
        &messages,
        REFINE_PROMPT_MAX_TOKENS,
    )
    .await
}

impl AgentRegistry {
    pub fn cancel(&mut self, task_id: &str) -> Result<(), String> {
        let Some(run) = self.runs.get_mut(task_id) else {
            return Err(format!("Task not found: {task_id}"));
        };

        if matches!(
            run.status,
            AgentStatus::Completed | AgentStatus::Cancelled | AgentStatus::Failed
        ) {
            return Ok(());
        }

        run.status = AgentStatus::Cancelling;
        run.cancel.cancel();
        Ok(())
    }

    pub fn start(
        &mut self,
        params: AgentStartParams,
        broadcaster: Arc<crate::SseBroadcaster>,
        registry: Arc<Mutex<AgentRegistry>>,
        app_state: Arc<crate::AppState>,
    ) -> Result<(), String> {
        if let Some(existing) = self.runs.get(&params.task_id) {
            if is_active_run_status(&existing.status) {
                return Err(format!("Task already exists: {}", params.task_id));
            }
            self.runs.remove(&params.task_id);
        }

        let api_key = resolve_api_key(
            params.api_key_source.as_str(),
            params.api_key.as_deref(),
            params.api_key_env_var.as_str(),
        )?;

        if params.base_url.trim().is_empty() {
            return Err("Base URL is required".to_string());
        }

        if params.model.trim().is_empty() {
            return Err("Model is required".to_string());
        }

        if params.messages.is_empty() {
            return Err("Messages are required".to_string());
        }

        let cancel = CancellationToken::new();
        let child_cancel = cancel.child_token();
        let task_id = params.task_id.clone();
        let model = params.model.clone();
        let client = self.client.clone();
        let emit_broadcaster = broadcaster.clone();
        let emit_task_id = task_id.clone();
        let session_id = params.session_id.clone();

        self.runs.insert(
            params.task_id.clone(),
            AgentRun {
                status: AgentStatus::Running,
                session_id: session_id.clone(),
                cancel,
                event_log: EventLog::new(),
            },
        );

        let initial_event = AgentEvent::Status {
            task_id: emit_task_id.clone(),
            status: AgentStatus::Running,
        };
        debug_emit_log(&initial_event);
        if let Ok(json) = serde_json::to_string(&initial_event) {
            let seq = self.record_event(&emit_task_id, &json);
            emit_broadcaster.emit(&emit_task_id, &super::loop_::inject_seq_into_event_json(&json, seq));
        }

        tokio::spawn(async move {
            let result = run_agent_loop(
                AgentStartParams {
                    api_key: Some(api_key),
                    ..params
                },
                client,
                emit_broadcaster.clone(),
                child_cancel.clone(),
                registry.clone(),
                app_state.clone(),
            )
            .await;

            let final_status = if child_cancel.is_cancelled() {
                AgentStatus::Cancelled
            } else {
                match &result {
                    Ok(()) => AgentStatus::Completed,
                    Err(AgentLoopError::Cancelled) => AgentStatus::Cancelled,
                    Err(_) => AgentStatus::Failed,
                }
            };

            if let Ok(mut registry_guard) = registry.lock() {
                registry_guard.update_status(&task_id, final_status.clone());
            }

            let failure_message = result.as_ref().err().map(|error| error.to_string());

            if let Err(message) = &result {
                agent_diagnostic_log(format!(
                    "task_failed task_id={task_id} model={model} message={message:?}"
                ));
                let error_event = AgentEvent::Error {
                    task_id: task_id.clone(),
                    message: message.to_string(),
                };
                debug_emit_log(&error_event);
                if let Ok(json) = serde_json::to_string(&error_event) {
                    let seq = if let Ok(mut registry_guard) = registry.lock() {
                        registry_guard.record_event(&task_id, &json)
                    } else {
                        0
                    };
                    emit_broadcaster.emit(
                        &task_id,
                        &super::loop_::inject_seq_into_event_json(&json, seq),
                    );
                }
            }

            let final_event = AgentEvent::Status {
                task_id: task_id.clone(),
                status: final_status.clone(),
            };
            debug_emit_log(&final_event);
            if let Ok(json) = serde_json::to_string(&final_event) {
                let seq = if let Ok(mut registry_guard) = registry.lock() {
                    registry_guard.record_event(&task_id, &json)
                } else {
                    0
                };
                emit_broadcaster.emit(
                    &task_id,
                    &super::loop_::inject_seq_into_event_json(&json, seq),
                );
            }

            emit_broadcaster.unregister(&task_id);

            if let Ok(mut registry) = registry.lock() {
                registry.remove_run(&task_id);
            }

            if let Ok(db) = app_state.db.lock() {
                let _ = find_assistant_message_by_task_id(
                    &db,
                    session_id.as_deref(),
                    &task_id,
                )
                .and_then(|message| {
                    if let Some(message) = message {
                        update_message(&db, &message.id, false, |record| {
                            record.status = match final_status {
                                AgentStatus::Pending => "pending",
                                AgentStatus::Running => "streaming",
                                AgentStatus::Cancelling => "cancelling",
                                AgentStatus::Cancelled => "cancelled",
                                AgentStatus::Completed => "completed",
                                AgentStatus::Failed => "failed",
                            }
                            .to_string();
                            if matches!(final_status, AgentStatus::Failed) {
                                record.error = Some(
                                    failure_message
                                        .clone()
                                        .unwrap_or_else(|| "Agent task failed".to_string()),
                                );
                            }
                            if matches!(final_status, AgentStatus::Cancelled) {
                                record.error = Some("Cancelled".to_string());
                            }
                            record.duration_ms = Some(
                                current_timestamp_ms().saturating_sub(record.created_at),
                            );
                        })
                        .map(|_| ())
                    } else {
                        Ok(())
                    }
                });
            }
        });

        Ok(())
    }
}

fn resolve_api_key(
    source: &str,
    manual_key: Option<&str>,
    env_var: &str,
) -> Result<String, String> {
    // 1. Try explicit manual key from frontend
    if let Some(key) = manual_key {
        let trimmed = key.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    // 2. Try environment variable
    if source == "env" {
        if let Some(val) = crate::shell_env::get_env_var(env_var) {
            return Ok(val);
        }
    }

    // 3. Fallback: read from ~/.coder/settings.json (legacy settings file)
    if let Ok(settings) = std::fs::read_to_string(
        crate::get_coder_data_dir().join("settings.json"),
    ) {
        if let Ok(map) = serde_json::from_str::<serde_json::Value>(&settings) {
            // Try the env_var key first, then common API key keys
            for key in &[env_var, "OPENAI_API_KEY", "apiKey", "api_key"] {
                if let Some(val) = map.get(*key).and_then(|v| v.as_str()) {
                    let trimmed = val.trim();
                    if !trimmed.is_empty() {
                        return Ok(trimmed.to_string());
                    }
                }
            }
        }
    }

    Err(format!("API key is required. Set the {env_var} environment variable or configure it in settings."))
}

fn is_active_run_status(status: &AgentStatus) -> bool {
    matches!(
        status,
        AgentStatus::Pending | AgentStatus::Running | AgentStatus::Cancelling
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terminal_run_status_is_not_active() {
        assert!(!is_active_run_status(&AgentStatus::Completed));
        assert!(!is_active_run_status(&AgentStatus::Cancelled));
        assert!(!is_active_run_status(&AgentStatus::Failed));
    }

    #[test]
    fn in_flight_run_status_is_active() {
        assert!(is_active_run_status(&AgentStatus::Running));
        assert!(is_active_run_status(&AgentStatus::Cancelling));
        assert!(is_active_run_status(&AgentStatus::Pending));
    }
}
