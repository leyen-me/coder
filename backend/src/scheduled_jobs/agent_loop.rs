use std::sync::Arc;

use reqwest::Client;
use tokio_util::sync::CancellationToken;

use crate::agent::openai::{chat_completions_url, stream_chat_completion};
use crate::agent::{
    AgentEvent, AgentToolDefinition, ApiToolCall, ApiToolCallFunction, ChatMessage, ToolCall,
};
use crate::agent::registry::AgentRegistry;

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

    let mut final_content = String::new();
    let mut final_thinking = String::new();

    for turn_index in 0..MAX_AGENT_TURNS {
        let task_id = format!("{}-turn-{turn_index}", input.session_id);
        let turn = run_single_turn(
            &client,
            input.provider,
            input.model,
            &messages,
            tools_option,
            &task_id,
        )
        .await?;

        if let Some(error) = turn.error {
            return Err(error);
        }

        if !turn.content.is_empty() {
            final_content = turn.content.clone();
        }
        if !turn.thinking.is_empty() {
            final_thinking = turn.thinking.clone();
        }

        if turn.tool_calls.is_empty() {
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

    Err("Scheduled job exceeded maximum agent turns".to_string())
}

async fn run_single_turn(
    client: &Client,
    provider: &ResolvedProvider,
    model: &str,
    messages: &[ChatMessage],
    tools: Option<&[AgentToolDefinition]>,
    task_id: &str,
) -> Result<TurnResult, String> {
    let cancel = CancellationToken::new();
    let mut collector = TurnCollector::new();
    stream_chat_completion(
        client,
        chat_completions_url(&provider.base_url),
        &provider.api_key,
        model,
        messages,
        tools,
        None,
        cancel,
        |event| collector.on_event(event),
        task_id,
    )
    .await?;

    Ok(collector.into_result())
}
