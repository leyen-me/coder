use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use reqwest::Client;
use serde_json::Value;
use tauri::ipc::Channel;
use tokio_util::sync::CancellationToken;

use super::openai::{
    build_http_client, chat_completions_url, complete_chat_completion, stream_chat_completion,
    SESSION_TITLE_SYSTEM_PROMPT,
};
use super::stream_log::agent_stream_log;
use super::types::{
    AgentEvent, AgentStartParams, AgentStatus, AgentStatusResponse, ChatMessage,
    GenerateSessionTitleParams,
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
        AgentEvent::TurnComplete {
            task_id,
            tool_calls,
        } => {
            agent_stream_log(format!(
                "emit task_id={task_id} type=turn_complete tool_calls={}",
                tool_calls.len()
            ));
        }
        AgentEvent::Done { task_id } => {
            agent_stream_log(format!("emit task_id={task_id} type=done"));
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
    cancel: CancellationToken,
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
        })
    }

    pub fn http_client(&self) -> Client {
        self.client.clone()
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

    let assistant_snippet: String = params.assistant_message.trim().chars().take(600).collect();

    let user_prompt = if assistant_snippet.is_empty() {
        format!("User message:\n{user_message}")
    } else {
        format!("User message:\n{user_message}\n\nAssistant reply (excerpt):\n{assistant_snippet}")
    };

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
    complete_chat_completion(client, url, &api_key, params.model.trim(), &messages).await
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
        channel: Channel<AgentEvent>,
        registry: Arc<Mutex<AgentRegistry>>,
    ) -> Result<(), String> {
        if self.runs.contains_key(&params.task_id) {
            return Err(format!("Task already exists: {}", params.task_id));
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
        let url = chat_completions_url(&params.base_url);
        let model = params.model.clone();
        let messages = params.messages.clone();
        let tools = params.tools.clone();
        let request_extensions = params.request_extensions.clone();
        let client = self.client.clone();

        self.runs.insert(
            params.task_id.clone(),
            AgentRun {
                status: AgentStatus::Running,
                cancel,
            },
        );

        let emit_task_id = task_id.clone();
        let initial_event = AgentEvent::Status {
            task_id: emit_task_id.clone(),
            status: AgentStatus::Running,
        };
        debug_emit_log(&initial_event);
        let _ = channel.send(initial_event);

        tauri::async_runtime::spawn(async move {
            let result = stream_chat_completion(
                &client,
                url,
                &api_key,
                &model,
                &messages,
                tools.as_deref(),
                request_extensions.as_ref(),
                child_cancel.clone(),
                |event| {
                    debug_emit_log(&event);
                    let _ = channel.send(event);
                },
                &task_id,
            )
            .await;

            let final_status = if child_cancel.is_cancelled() {
                AgentStatus::Cancelled
            } else {
                match &result {
                    Ok(()) => AgentStatus::Completed,
                    Err(_) => AgentStatus::Failed,
                }
            };

            if let Err(message) = result {
                let error_event = AgentEvent::Error {
                    task_id: task_id.clone(),
                    message,
                };
                debug_emit_log(&error_event);
                let _ = channel.send(error_event);
            }

            let final_event = AgentEvent::Status {
                task_id: task_id.clone(),
                status: final_status,
            };
            debug_emit_log(&final_event);
            let _ = channel.send(final_event);

            if let Ok(mut registry) = registry.lock() {
                registry.runs.remove(&task_id);
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
    match source {
        "env" => crate::shell_env::get_env_var(env_var)
            .ok_or_else(|| format!("Environment variable not set: {env_var}")),
        _ => manual_key
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .ok_or_else(|| "API key is required".to_string()),
    }
}
