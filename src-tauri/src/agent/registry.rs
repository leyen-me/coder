use std::collections::HashMap;

use reqwest::Client;
use tauri::ipc::Channel;
use tokio_util::sync::CancellationToken;

use super::openai::{build_http_client, chat_completions_url, stream_chat_completion};
use super::types::{
    AgentEvent, AgentStartParams, AgentStatus, AgentStatusResponse,
};

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
        let client = self.client.clone();

        self.runs.insert(
            params.task_id.clone(),
            AgentRun {
                status: AgentStatus::Running,
                cancel,
            },
        );

        let emit_task_id = task_id.clone();
        let _ = channel.send(AgentEvent::Status {
            task_id: emit_task_id.clone(),
            status: AgentStatus::Running,
        });

        tauri::async_runtime::spawn(async move {
            let result = stream_chat_completion(
                &client,
                url,
                &api_key,
                &model,
                &messages,
                child_cancel.clone(),
                |event| {
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
                let _ = channel.send(AgentEvent::Error {
                    task_id: task_id.clone(),
                    message,
                });
            }

            let _ = channel.send(AgentEvent::Status {
                task_id: task_id.clone(),
                status: final_status,
            });
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
        "env" => std::env::var(env_var.trim())
            .map_err(|_| format!("Environment variable not set: {env_var}")),
        _ => manual_key
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .ok_or_else(|| "API key is required".to_string()),
    }
}