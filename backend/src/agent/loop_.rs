use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;

use super::openai::stream_chat_completion;
use super::tool_dispatch::{
    execute_tool_call, serialize_tool_result, ToolExecutionContext,
};
use super::types::{
    AgentContextUsageSnapshot, AgentEvent, AgentStartParams, ChatMessage, TokenUsage,
    ToolCall,
};
use crate::db::{Database, IndexEntry};

const MAX_RETRY_ATTEMPTS: u32 = 3;
const TOOL_STALL_THRESHOLD: u32 = 3;

#[derive(Debug)]
pub enum AgentLoopError {
    Cancelled,
    Stalled(String),
    Chat(String),
    Tool(String),
    Other(String),
}

impl std::fmt::Display for AgentLoopError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Cancelled => write!(f, "Cancelled"),
            Self::Stalled(message) => write!(f, "{message}"),
            Self::Chat(message) => write!(f, "{message}"),
            Self::Tool(message) => write!(f, "{message}"),
            Self::Other(message) => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for AgentLoopError {}

#[derive(Debug, Clone)]
struct AgentTurnResult {
    tool_calls: Vec<ToolCall>,
    content: String,
    reasoning_content: String,
    usage: Option<TokenUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MessageToolInvocation {
    id: String,
    name: String,
    input: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    output: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error_text: Option<String>,
    state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum MessageProcessStep {
    Reasoning { id: String, text: String },
    Answer { id: String, text: String },
    Tool { id: String, tool_call_id: String },
}

#[derive(Debug, Clone)]
struct PersistedMessageState {
    session_id: String,
    message_id: String,
    created_at: u64,
    content: String,
    thinking: String,
    process_steps: Vec<MessageProcessStep>,
    tool_invocations: Vec<MessageToolInvocation>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionRecord {
    workspace_dir: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MessageRecord {
    id: String,
    session_id: String,
    role: String,
    content: String,
    thinking: String,
    #[serde(default)]
    process_steps: Vec<MessageProcessStep>,
    tool_invocations: Vec<MessageToolInvocation>,
    task_id: Option<String>,
    created_at: u64,
}

pub async fn run_agent_loop(
    params: AgentStartParams,
    http_client: reqwest::Client,
    broadcaster: Arc<crate::SseBroadcaster>,
    cancel_token: CancellationToken,
    registry: Arc<Mutex<super::registry::AgentRegistry>>,
    app_state: Arc<crate::AppState>,
) -> Result<(), AgentLoopError> {
    let mut messages = params.messages.clone();
    let tools = params.tools.clone().unwrap_or_default();
    let workspace_dir = resolve_workspace_dir(&app_state.db, params.session_id.as_deref());
    let mut persisted_state =
        find_persisted_message_state(&app_state.db, params.session_id.as_deref(), &params.task_id);
    let mut cumulative_usage: Option<TokenUsage> = None;
    let mut last_tool_signature: Option<String> = None;
    let mut repeated_tool_signature_count = 0_u32;
    let mut turn_index = 0_u32;

    if let Some(state) = persisted_state.as_mut() {
        persist_message_snapshot(
            &app_state.db,
            state,
            MessageStatusPatch {
                status: Some("streaming"),
                error: None,
                usage: None,
                duration_ms: None,
            },
        )?;
    }

    loop {
        if cancel_token.is_cancelled() {
            return Err(AgentLoopError::Cancelled);
        }

        if let Some(snapshot) = should_trigger_handoff(&messages, &params) {
            emit_event(&registry, &broadcaster, &params.task_id, AgentEvent::HandoffRequired {
                task_id: params.task_id.clone(),
                context_usage: snapshot,
            })?;
            emit_event(
                &registry,
                &broadcaster,
                &params.task_id,
                AgentEvent::Done {
                    task_id: params.task_id.clone(),
                    usage: cumulative_usage.clone(),
                },
            )?;
            return Ok(());
        }

        let turn = run_single_turn_with_retry(
            &params,
            &messages,
            &tools,
            &http_client,
            &broadcaster,
            &cancel_token,
            &registry,
            persisted_state.as_mut(),
            &app_state.db,
        )
        .await?;
        turn_index += 1;

        if let Some(usage) = &turn.usage {
            cumulative_usage = Some(match cumulative_usage.as_ref() {
                Some(acc) => merge_usage(acc, usage),
                None => usage.clone(),
            });
        }

        if turn.tool_calls.is_empty() {
            let final_usage = cumulative_usage.clone().or(turn.usage.clone());
            log::info!(
                "agent_task_completed task_id={} turns={} content_chars={} reasoning_chars={} total_tokens={}",
                params.task_id,
                turn_index,
                turn.content.chars().count(),
                turn.reasoning_content.chars().count(),
                final_usage.as_ref().map(|usage| usage.total_tokens).unwrap_or(0)
            );
            emit_event(
                &registry,
                &broadcaster,
                &params.task_id,
                AgentEvent::Done {
                    task_id: params.task_id.clone(),
                    usage: final_usage.clone(),
                },
            )?;
            if let Some(state) = persisted_state.as_mut() {
                persist_message_snapshot(
                    &app_state.db,
                    state,
                    MessageStatusPatch {
                        status: Some("completed"),
                        error: None,
                        usage: final_usage,
                        duration_ms: Some(current_timestamp_ms().saturating_sub(state.created_at)),
                    },
                )?;
            }
            return Ok(());
        }

        let tool_signature = turn
            .tool_calls
            .iter()
            .map(|call| format!("{}:{}", call.name, call.arguments))
            .collect::<Vec<_>>()
            .join("|");
        if is_stalled(&mut last_tool_signature, &mut repeated_tool_signature_count, &tool_signature)
        {
            return Err(AgentLoopError::Stalled(
                "Agent repeated the same tool calls without making progress.".to_string(),
            ));
        }

        messages = execute_and_append_tool_results(
            &messages,
            &turn,
            ToolExecutionContext {
                workspace_dir: workspace_dir.clone(),
                session_id: params.session_id.clone(),
                task_id: Some(params.task_id.clone()),
                current_tool_call_id: None,
                agent_mode: params.agent_mode.clone(),
                available_tools: tools.clone(),
                parent_start_params: params.clone(),
                allow_private_network_access: true,
                app_state: app_state.clone(),
                db: app_state.db.clone(),
                ask_question_registry: app_state.ask_question_registry.clone(),
                shell_registry: app_state.shell_registry.clone(),
                mcp_registry: app_state.mcp_registry.clone(),
                remote_pool: &app_state.remote_pool,
                page_cache: &app_state.page_cache,
                broadcaster: Some(broadcaster.clone()),
                cancel_token: cancel_token.clone(),
            },
            &broadcaster,
            &registry,
            persisted_state.as_mut(),
            &app_state.db,
        )
        .await?;
    }
}

async fn run_single_turn_with_retry(
    params: &AgentStartParams,
    messages: &[ChatMessage],
    tools: &[super::types::AgentToolDefinition],
    client: &reqwest::Client,
    broadcaster: &Arc<crate::SseBroadcaster>,
    cancel_token: &CancellationToken,
    registry: &Arc<Mutex<super::registry::AgentRegistry>>,
    persisted_state: Option<&mut PersistedMessageState>,
    db: &Arc<Mutex<Database>>,
) -> Result<AgentTurnResult, AgentLoopError> {
    let mut turn_messages = messages.to_vec();
    let mut last_error = None;
    let mut persisted_state = persisted_state;

    for attempt in 1..=MAX_RETRY_ATTEMPTS {
        match run_single_turn_attempt(
            params,
            &turn_messages,
            tools,
            client,
            broadcaster,
            cancel_token,
            registry,
            persisted_state.as_deref_mut(),
            db,
        )
        .await
        {
            Ok(turn) => return Ok(turn),
            Err(error) if matches!(error, AgentLoopError::Cancelled) => return Err(error),
            Err(AgentLoopError::Chat(message))
                if attempt < MAX_RETRY_ATTEMPTS && is_stream_retryable(&message) =>
            {
                last_error = Some(message.clone());
                emit_event(
                    registry,
                    broadcaster,
                    &params.task_id,
                    AgentEvent::ChatRetry {
                        task_id: params.task_id.clone(),
                        attempt: attempt + 1,
                        max_attempts: MAX_RETRY_ATTEMPTS,
                    },
                )?;
                turn_messages = build_stream_idle_recovery_messages(&turn_messages);
            }
            Err(error) => return Err(error),
        }
    }

    Err(AgentLoopError::Chat(
        last_error.unwrap_or_else(|| "Agent turn failed".to_string()),
    ))
}

async fn run_single_turn_attempt(
    params: &AgentStartParams,
    messages: &[ChatMessage],
    tools: &[super::types::AgentToolDefinition],
    client: &reqwest::Client,
    broadcaster: &Arc<crate::SseBroadcaster>,
    cancel_token: &CancellationToken,
    registry: &Arc<Mutex<super::registry::AgentRegistry>>,
    mut persisted_state: Option<&mut PersistedMessageState>,
    db: &Arc<Mutex<Database>>,
) -> Result<AgentTurnResult, AgentLoopError> {
    let mut tool_calls = Vec::new();
    let mut content = String::new();
    let mut reasoning = String::new();
    let mut usage = None;

    let emit_assistant_output = params.emit_assistant_output.unwrap_or(true);

    let result = stream_chat_completion(
        client,
        super::openai::chat_completions_url(&params.base_url),
        params.api_key.as_deref().unwrap_or_default(),
        params.model.as_str(),
        messages,
        Some(tools),
        params.request_extensions.as_ref(),
        cancel_token.clone(),
        |event| {
            match &event {
                AgentEvent::ThinkingDelta { delta, .. } => {
                    reasoning.push_str(delta);
                    if let Some(state) = persisted_state.as_mut() {
                        state.thinking = reasoning.clone();
                        append_process_text_step(&mut state.process_steps, "reasoning", delta);
                        let _ = persist_message_snapshot(
                            db,
                            state,
                            MessageStatusPatch {
                                status: Some("streaming"),
                                error: None,
                                usage: None,
                                duration_ms: None,
                            },
                        );
                    }
                    if emit_assistant_output {
                        let _ = emit_event(registry, broadcaster, &params.task_id, event.clone());
                    }
                }
                AgentEvent::ContentDelta { delta, .. } => {
                    content.push_str(delta);
                    if let Some(state) = persisted_state.as_mut() {
                        state.content = content.clone();
                        append_process_text_step(&mut state.process_steps, "answer", delta);
                        let _ = persist_message_snapshot(
                            db,
                            state,
                            MessageStatusPatch {
                                status: Some("streaming"),
                                error: None,
                                usage: None,
                                duration_ms: None,
                            },
                        );
                    }
                    if emit_assistant_output {
                        let _ = emit_event(registry, broadcaster, &params.task_id, event.clone());
                    }
                }
                AgentEvent::ToolCallPending { .. } => {
                    let _ = emit_event(registry, broadcaster, &params.task_id, event.clone());
                }
                AgentEvent::TurnComplete {
                    tool_calls: calls, ..
                } => {
                    tool_calls = calls.clone();
                }
                AgentEvent::Done {
                    usage: next_usage, ..
                } => {
                    usage = next_usage.clone();
                }
                _ => {
                    let _ = emit_event(registry, broadcaster, &params.task_id, event.clone());
                }
            }
        },
        &params.task_id,
    )
    .await;

    if cancel_token.is_cancelled() {
        return Err(AgentLoopError::Cancelled);
    }

    match result {
        Ok(()) => Ok(AgentTurnResult {
            tool_calls,
            content,
            reasoning_content: reasoning,
            usage,
        }),
        Err(error) => Err(AgentLoopError::Chat(error)),
    }
}

async fn execute_and_append_tool_results(
    messages: &[ChatMessage],
    turn: &AgentTurnResult,
    ctx: ToolExecutionContext<'_>,
    broadcaster: &Arc<crate::SseBroadcaster>,
    registry: &Arc<Mutex<super::registry::AgentRegistry>>,
    mut persisted_state: Option<&mut PersistedMessageState>,
    db: &Arc<Mutex<Database>>,
) -> Result<Vec<ChatMessage>, AgentLoopError> {
    let assistant_message = build_assistant_message(turn);
    let mut next_messages = messages.to_vec();
    next_messages.push(assistant_message);

    let mut invocation_state =
        persisted_state.as_ref().map(|state| state.tool_invocations.clone());
    for call in &turn.tool_calls {
        let input = parse_tool_input(&call.arguments);
        emit_event(
            registry,
            broadcaster,
            ctx.task_id.as_deref().unwrap_or_default(),
            AgentEvent::ToolCallStarted {
                task_id: ctx.task_id.clone().unwrap_or_default(),
                tool_call_id: call.id.clone(),
                name: call.name.clone(),
                input: input.clone(),
            },
        )?;
        if let Some(invocations) = invocation_state.as_mut() {
            invocations.push(MessageToolInvocation {
                id: call.id.clone(),
                name: call.name.clone(),
                input: input.clone(),
                output: None,
                error_text: None,
                state: "input-available".to_string(),
            });
            if let Some(state) = persisted_state.as_mut() {
                ensure_tool_process_step(&mut state.process_steps, &call.id);
                state.tool_invocations = invocations.clone();
                persist_message_snapshot(
                    db,
                    state,
                    MessageStatusPatch {
                        status: Some("streaming"),
                        error: None,
                        usage: None,
                        duration_ms: None,
                    },
                )?;
            }
        }

        let call_ctx = ToolExecutionContext {
            current_tool_call_id: Some(call.id.clone()),
            ..ctx.clone()
        };
        let tool_result = execute_tool_call(&call.name, &call.arguments, &call_ctx)
            .await
            .map_err(AgentLoopError::Tool)?;
        let output = tool_result.data.clone();
        let error_text = tool_result.error.as_ref().map(|error| error.message.clone());
        emit_event(
            registry,
            broadcaster,
            ctx.task_id.as_deref().unwrap_or_default(),
            AgentEvent::ToolCallFinished {
                task_id: ctx.task_id.clone().unwrap_or_default(),
                tool_call_id: call.id.clone(),
                output: output.clone(),
                error_text: error_text.clone(),
            },
        )?;

        if let Some(invocations) = invocation_state.as_mut() {
            if let Some(existing) = invocations.iter_mut().find(|item| item.id == call.id) {
                existing.output = output;
                existing.error_text = error_text.clone();
                existing.state = if error_text.is_some() {
                    "output-error".to_string()
                } else {
                    "output-available".to_string()
                };
            }
            if let Some(state) = persisted_state.as_mut() {
                state.tool_invocations = invocations.clone();
                persist_message_snapshot(
                    db,
                    state,
                    MessageStatusPatch {
                        status: Some("streaming"),
                        error: None,
                        usage: None,
                        duration_ms: None,
                    },
                )?;
            }
        }

        next_messages.push(ChatMessage {
            role: "tool".to_string(),
            content: Some(Value::String(serialize_tool_result(&tool_result))),
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: Some(call.id.clone()),
            name: Some(call.name.clone()),
        });
    }

    Ok(next_messages)
}

fn merge_usage(acc: &TokenUsage, next: &TokenUsage) -> TokenUsage {
    TokenUsage {
        prompt_tokens: acc.prompt_tokens.saturating_add(next.prompt_tokens),
        completion_tokens: acc.completion_tokens.saturating_add(next.completion_tokens),
        total_tokens: acc.total_tokens.saturating_add(next.total_tokens),
    }
}

fn build_assistant_message(turn: &AgentTurnResult) -> ChatMessage {
    ChatMessage {
        role: "assistant".to_string(),
        content: (!turn.content.is_empty()).then_some(Value::String(turn.content.clone())),
        reasoning_content: (!turn.reasoning_content.is_empty())
            .then_some(turn.reasoning_content.clone()),
        tool_calls: (!turn.tool_calls.is_empty()).then_some(
            turn.tool_calls
                .iter()
                .map(|call| super::types::ApiToolCall {
                    id: call.id.clone(),
                    kind: "function".to_string(),
                    function: super::types::ApiToolCallFunction {
                        name: call.name.clone(),
                        arguments: call.arguments.clone(),
                    },
                })
                .collect(),
        ),
        tool_call_id: None,
        name: None,
    }
}

fn resolve_workspace_dir(
    db: &Arc<Mutex<Database>>,
    session_id: Option<&str>,
) -> Option<String> {
    let session_id = session_id?.trim();
    if session_id.is_empty() {
        return None;
    }
    let db = db.lock().ok()?;
    let session = db.get::<SessionRecord>("sessions", session_id).ok()??;
    session.workspace_dir.filter(|value| !value.trim().is_empty())
}

fn find_persisted_message_state(
    db: &Arc<Mutex<Database>>,
    session_id: Option<&str>,
    task_id: &str,
) -> Option<PersistedMessageState> {
    let session_id = session_id?.trim();
    if session_id.is_empty() {
        return None;
    }
    let db = db.lock().ok()?;
    let messages = db
        .get_all_from_index::<MessageRecord>("messages", "by-sessionId", Some(session_id))
        .ok()?;
    let message = messages.into_iter().find(|message| {
        message.role == "assistant" && message.task_id.as_deref() == Some(task_id)
    })?;
    Some(PersistedMessageState {
        session_id: message.session_id,
        message_id: message.id,
        created_at: message.created_at,
        content: message.content,
        thinking: message.thinking,
        process_steps: message.process_steps,
        tool_invocations: message.tool_invocations,
    })
}

#[derive(Default)]
struct MessageStatusPatch {
    status: Option<&'static str>,
    error: Option<String>,
    usage: Option<TokenUsage>,
    duration_ms: Option<u64>,
}

fn persist_message_snapshot(
    db: &Arc<Mutex<Database>>,
    state: &PersistedMessageState,
    patch: MessageStatusPatch,
) -> Result<(), AgentLoopError> {
    let db = db
        .lock()
        .map_err(|_| AgentLoopError::Other("Database lock poisoned".to_string()))?;
    let Some(mut message) = db
        .get::<Value>("messages", &state.message_id)
        .map_err(AgentLoopError::Other)?
    else {
        return Ok(());
    };
    let Some(object) = message.as_object_mut() else {
        return Ok(());
    };
    object.insert("content".to_string(), Value::String(state.content.clone()));
    object.insert("thinking".to_string(), Value::String(state.thinking.clone()));
    object.insert(
        "processSteps".to_string(),
        serde_json::to_value(&state.process_steps)
            .map_err(|error| AgentLoopError::Other(error.to_string()))?,
    );
    object.insert(
        "toolInvocations".to_string(),
        serde_json::to_value(&state.tool_invocations)
            .map_err(|error| AgentLoopError::Other(error.to_string()))?,
    );
    if let Some(status) = patch.status {
        object.insert("status".to_string(), Value::String(status.to_string()));
    }
    object.insert(
        "error".to_string(),
        patch.error.map(Value::String).unwrap_or(Value::Null),
    );
    if let Some(usage) = patch.usage {
        object.insert(
            "usage".to_string(),
            serde_json::to_value(usage).map_err(|error| AgentLoopError::Other(error.to_string()))?,
        );
    }
    if let Some(duration_ms) = patch.duration_ms {
        object.insert("durationMs".to_string(), Value::from(duration_ms));
    }
    let indexes = vec![
        IndexEntry {
            name: "by-sessionId".to_string(),
            value: state.session_id.clone(),
        },
        IndexEntry {
            name: "by-sessionId-createdAt".to_string(),
            value: state.session_id.clone(),
        },
    ];
    db.put("messages", &state.message_id, &message, &indexes)
        .map_err(AgentLoopError::Other)
}

fn emit_event(
    registry: &Arc<Mutex<super::registry::AgentRegistry>>,
    broadcaster: &Arc<crate::SseBroadcaster>,
    task_id: &str,
    event: AgentEvent,
) -> Result<u64, AgentLoopError> {
    let json = serde_json::to_string(&event)
        .map_err(|error| AgentLoopError::Other(format!("Failed to serialize event: {error}")))?;
    let seq = {
        let mut registry = registry
            .lock()
            .map_err(|_| AgentLoopError::Other("Agent registry lock poisoned".to_string()))?;
        registry.record_event(task_id, &json)
    };
    broadcaster.emit(task_id, &inject_seq_into_event_json(&json, seq));
    Ok(seq)
}

pub fn inject_seq_into_event_json(event_json: &str, seq: u64) -> String {
    match serde_json::from_str::<Value>(event_json) {
        Ok(Value::Object(mut object)) => {
            object.insert("seq".to_string(), Value::from(seq));
            Value::Object(object).to_string()
        }
        _ => event_json.to_string(),
    }
}

fn parse_tool_input(arguments: &str) -> Value {
    serde_json::from_str(arguments).unwrap_or_else(|_| json!({}))
}

fn should_trigger_handoff(
    messages: &[ChatMessage],
    params: &AgentStartParams,
) -> Option<AgentContextUsageSnapshot> {
    let max_tokens = params.max_context_tokens?;
    let trigger_threshold = params.handoff_trigger_threshold.unwrap_or(0.85);
    let used_tokens = messages
        .iter()
        .map(|message| {
            estimate_text_tokens(
                message
                    .content
                    .as_ref()
                    .and_then(Value::as_str)
                    .unwrap_or_default(),
            ) + estimate_text_tokens(message.reasoning_content.as_deref().unwrap_or_default())
        })
        .sum::<u32>();
    let threshold_tokens = (max_tokens as f64 * trigger_threshold).ceil() as u32;
    if used_tokens < threshold_tokens {
        return None;
    }
    Some(AgentContextUsageSnapshot {
        used_tokens,
        max_tokens,
        remaining_tokens: max_tokens.saturating_sub(used_tokens),
        reserved_tokens: max_tokens.saturating_sub(threshold_tokens),
        trigger_threshold,
    })
}

fn estimate_text_tokens(text: &str) -> u32 {
    let mut count = 0_f64;
    for ch in text.chars() {
        if ch.is_ascii() {
            count += 0.25;
        } else {
            count += 1.0;
        }
    }
    count.ceil() as u32
}

fn is_stalled(
    last_signature: &mut Option<String>,
    repeated_count: &mut u32,
    next_signature: &str,
) -> bool {
    match last_signature {
        Some(previous) if previous == next_signature => {
            *repeated_count = repeated_count.saturating_add(1);
        }
        previous => {
            *previous = Some(next_signature.to_string());
            *repeated_count = 1;
        }
    }
    *repeated_count >= TOOL_STALL_THRESHOLD
}

fn is_stream_retryable(message: &str) -> bool {
    message.contains("timed out") || message.contains("Stream read failed")
}

fn build_stream_idle_recovery_messages(messages: &[ChatMessage]) -> Vec<ChatMessage> {
    let mut next = messages.to_vec();
    next.push(ChatMessage {
        role: "system".to_string(),
        content: Some(Value::String(
            "The previous streaming attempt ended early. Continue from the latest completed state without repeating finished work.".to_string(),
        )),
        reasoning_content: None,
        tool_calls: None,
        tool_call_id: None,
        name: None,
    });
    next
}

fn append_process_text_step(
    steps: &mut Vec<MessageProcessStep>,
    kind: &str,
    delta: &str,
) {
    if delta.is_empty() {
        return;
    }
    match (kind, steps.last_mut()) {
        ("reasoning", Some(MessageProcessStep::Reasoning { text, .. })) => {
            text.push_str(delta);
        }
        ("answer", Some(MessageProcessStep::Answer { text, .. })) => {
            text.push_str(delta);
        }
        ("reasoning", _) => steps.push(MessageProcessStep::Reasoning {
            id: format!("reasoning:{}", steps.len()),
            text: delta.to_string(),
        }),
        ("answer", _) => steps.push(MessageProcessStep::Answer {
            id: format!("answer:{}", steps.len()),
            text: delta.to_string(),
        }),
        _ => {}
    }
}

fn ensure_tool_process_step(steps: &mut Vec<MessageProcessStep>, tool_call_id: &str) {
    if steps.iter().any(|step| {
        matches!(
            step,
            MessageProcessStep::Tool { tool_call_id: existing, .. } if existing == tool_call_id
        )
    }) {
        return;
    }
    steps.push(MessageProcessStep::Tool {
        id: format!("tool:{tool_call_id}"),
        tool_call_id: tool_call_id.to_string(),
    });
}

fn current_timestamp_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
