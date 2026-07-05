use std::sync::Arc;

use reqwest::Client;
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;

use crate::agent::openai::{chat_completions_url, stream_chat_completion};
use crate::agent::{
    AgentEvent, AgentStatus, AgentToolDefinition, ApiToolCall, ApiToolCallFunction, ChatMessage,
    ToolCall,
};
use crate::agent::registry::AgentRegistry;
use crate::SseBroadcaster;

use super::provider::ResolvedProvider;
use super::tool_catalog;
use super::tool_runner;
use super::types::{AgentMode, MAX_AGENT_TURNS};

pub struct TurnResult {
    pub content: String,
    pub thinking: String,
    pub tool_calls: Vec<ToolCall>,
    pub error: Option<String>,
}

struct TurnCollector {
    content: String,
    thinking: String,
    tool_calls: Vec<ToolCall>,
    error: Option<String>,
}

impl TurnCollector {
    fn new() -> Self {
        Self {
            content: String::new(),
            thinking: String::new(),
            tool_calls: Vec::new(),
            error: None,
        }
    }

    fn on_event(&mut self, event: AgentEvent) {
        match event {
            AgentEvent::ContentDelta { delta, .. } => self.content.push_str(&delta),
            AgentEvent::ThinkingDelta { delta, .. } => self.thinking.push_str(&delta),
            AgentEvent::TurnComplete { tool_calls, .. } => self.tool_calls = tool_calls,
            AgentEvent::Error { message, .. } => self.error = Some(message),
            _ => {}
        }
    }

    fn into_result(self) -> TurnResult {
        TurnResult {
            content: self.content,
            thinking: self.thinking,
            tool_calls: self.tool_calls,
            error: self.error,
        }
    }
}

pub struct AgentLoopInput<'a> {
    pub provider: &'a ResolvedProvider,
    pub model: &'a str,
    pub agent_mode: &'a AgentMode,
    pub enable_email: bool,
    pub workspace_dir: Option<&'a str>,
    pub session_id: &'a str,
    pub system_prompt: &'a str,
    pub user_prompt: &'a str,
    pub http_base_url: &'a str,
    pub thinking_enabled: bool,
    pub sse_broadcaster: Option<Arc<SseBroadcaster>>,
    pub on_agent_event: Option<Arc<dyn Fn(AgentEvent) + Send + Sync>>,
}

fn emit_agent_event(
    task_id: &str,
    sse_broadcaster: Option<&SseBroadcaster>,
    on_agent_event: Option<&Arc<dyn Fn(AgentEvent) + Send + Sync>>,
    event: AgentEvent,
) {
    if let Some(callback) = on_agent_event {
        callback(event.clone());
    }
    if let Some(broadcaster) = sse_broadcaster {
        broadcaster.emit_agent_event(task_id, &event);
    }
}

fn parse_tool_input(arguments: &str) -> Value {
    serde_json::from_str(arguments).unwrap_or_else(|_| json!({}))
}

fn parse_tool_result(result: &str) -> (Option<Value>, Option<String>) {
    let parsed: Value = serde_json::from_str(result).unwrap_or_else(|_| json!({ "raw": result }));
    if parsed.get("ok") == Some(&Value::Bool(false)) {
        let message = parsed
            .pointer("/error/message")
            .and_then(|value| value.as_str())
            .unwrap_or("Tool execution failed");
        return (None, Some(message.to_string()));
    }
    (Some(parsed), None)
}

pub async fn run_to_completion(
    registry: &Arc<std::sync::Mutex<AgentRegistry>>,
    input: AgentLoopInput<'_>,
) -> Result<(String, String), String> {
    let client = {
        let guard = registry
            .lock()
            .map_err(|_| "Agent registry lock poisoned".to_string())?;
        guard.http_client()
    };

    let tools = tool_catalog::tool_definitions(input.agent_mode, input.enable_email);

    let tools_option = if tools.is_empty() {
        None
    } else {
        Some(tools.as_slice())
    };

    let mut messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: Some(serde_json::Value::String(input.system_prompt.to_string())),
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: None,
            name: None,
        },
        ChatMessage {
            role: "user".to_string(),
            content: Some(serde_json::Value::String(input.user_prompt.to_string())),
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: None,
            name: None,
        },
    ];

    let task_id = input.session_id.to_string();
    let sse = input.sse_broadcaster.as_deref();
    let on_event = input.on_agent_event.as_ref();

    emit_agent_event(
        &task_id,
        sse,
        on_event,
        AgentEvent::Status {
            task_id: task_id.clone(),
            status: AgentStatus::Running,
        },
    );

    let mut final_content = String::new();
    let mut final_thinking = String::new();

    for _turn_index in 0..MAX_AGENT_TURNS {
        let turn = run_single_turn(
            &client,
            input.provider,
            input.model,
            &messages,
            tools_option,
            &task_id,
            input.thinking_enabled,
            sse,
            on_event,
        )
        .await?;

        if let Some(error) = turn.error {
            emit_agent_event(
                &task_id,
                sse,
                on_event,
                AgentEvent::Error {
                    task_id: task_id.clone(),
                    message: error.clone(),
                },
            );
            emit_agent_event(
                &task_id,
                sse,
                on_event,
                AgentEvent::Status {
                    task_id: task_id.clone(),
                    status: AgentStatus::Failed,
                },
            );
            return Err(error);
        }

        if !turn.content.is_empty() {
            final_content = turn.content.clone();
        }
        if !turn.thinking.is_empty() {
            final_thinking = turn.thinking.clone();
        }

        if turn.tool_calls.is_empty() {
            emit_agent_event(
                &task_id,
                sse,
                on_event,
                AgentEvent::Done {
                    task_id: task_id.clone(),
                    usage: None,
                },
            );
            emit_agent_event(
                &task_id,
                sse,
                on_event,
                AgentEvent::Status {
                    task_id: task_id.clone(),
                    status: AgentStatus::Completed,
                },
            );
            return Ok((final_content, final_thinking));
        }

        let api_tool_calls: Vec<ApiToolCall> = turn
            .tool_calls
            .iter()
            .map(|call| ApiToolCall {
                id: call.id.clone(),
                kind: "function".to_string(),
                function: ApiToolCallFunction {
                    name: call.name.clone(),
                    arguments: call.arguments.clone(),
                },
            })
            .collect();

        messages.push(ChatMessage {
            role: "assistant".to_string(),
            content: if turn.content.is_empty() {
                None
            } else {
                Some(serde_json::Value::String(turn.content.clone()))
            },
            reasoning_content: if turn.thinking.is_empty() {
                None
            } else {
                Some(turn.thinking.clone())
            },
            tool_calls: Some(api_tool_calls),
            tool_call_id: None,
            name: None,
        });

        for call in &turn.tool_calls {
            emit_agent_event(
                &task_id,
                sse,
                on_event,
                AgentEvent::ToolCallStarted {
                    task_id: task_id.clone(),
                    tool_call_id: call.id.clone(),
                    name: call.name.clone(),
                    input: parse_tool_input(&call.arguments),
                },
            );

            let result = tool_runner::execute_tool_call(
                &client,
                input.http_base_url,
                &call.name,
                &call.arguments,
                input.workspace_dir,
                input.session_id,
                &task_id,
            )
            .await;

            let (output, error_text) = parse_tool_result(&result);
            emit_agent_event(
                &task_id,
                sse,
                on_event,
                AgentEvent::ToolCallFinished {
                    task_id: task_id.clone(),
                    tool_call_id: call.id.clone(),
                    output,
                    error_text,
                },
            );

            messages.push(ChatMessage {
                role: "tool".to_string(),
                content: Some(serde_json::Value::String(result)),
                reasoning_content: None,
                tool_calls: None,
                tool_call_id: Some(call.id.clone()),
                name: Some(call.name.clone()),
            });
        }
    }

    let error = "Scheduled job exceeded maximum agent turns".to_string();
    emit_agent_event(
        &task_id,
        sse,
        on_event,
        AgentEvent::Error {
            task_id: task_id.clone(),
            message: error.clone(),
        },
    );
    emit_agent_event(
        &task_id,
        sse,
        on_event,
        AgentEvent::Status {
            task_id: task_id.clone(),
            status: AgentStatus::Failed,
        },
    );
    Err(error)
}

async fn run_single_turn(
    client: &Client,
    provider: &ResolvedProvider,
    model: &str,
    messages: &[ChatMessage],
    tools: Option<&[AgentToolDefinition]>,
    task_id: &str,
    thinking_enabled: bool,
    sse_broadcaster: Option<&SseBroadcaster>,
    on_agent_event: Option<&Arc<dyn Fn(AgentEvent) + Send + Sync>>,
) -> Result<TurnResult, String> {
    let cancel = CancellationToken::new();
    let mut collector = TurnCollector::new();
    let request_extensions = super::provider::build_thinking_request_extensions(
        &provider.models,
        model,
        thinking_enabled,
    );
    stream_chat_completion(
        client,
        chat_completions_url(&provider.base_url),
        &provider.api_key,
        model,
        messages,
        tools,
        request_extensions.as_ref(),
        cancel,
        |event| {
            collector.on_event(event.clone());
            emit_agent_event(task_id, sse_broadcaster, on_agent_event, event);
        },
        task_id,
    )
    .await?;

    Ok(collector.into_result())
}
