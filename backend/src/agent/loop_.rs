use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;

use super::compact::{
    apply_compact, build_compact_snapshot, compact_reserve, persist_compact_summary, run_compact,
    should_trigger_compact, CompactPersistOptions, DEFAULT_COMPACT_THRESHOLD,
};
use super::decision::{
    build_final_answer_decision_request, build_proxy_continuation_message, request_proxy_decision,
    DecisionResponse,
};
use super::openai::stream_chat_completion;
use super::tool_dispatch::{
    execute_tool_call, serialize_tool_result, ToolExecutionContext, ConcurrentAgentStore,
};
use super::types::{AgentEvent, AgentStartParams, ChatMessage, TokenUsage, ToolCall};
use crate::db::{
    records::{
        current_timestamp_ms, DecisionOptionRecord, DecisionResponseRecord, MessageProcessStep,
        MessageToolInvocation, SessionContextUsageSnapshot,
    },
    session_store::{
        find_assistant_message_by_task_id, get_messages_by_session, get_session, update_session,
        CompactPersistResult,
    },
    Database,
};

const MAX_RETRY_ATTEMPTS: u32 = 3;
/// Consecutive identical tool-call signatures that abort the loop as "stalled".
/// A negative value (e.g. -1) disables stall detection entirely.
const TOOL_STALL_THRESHOLD: i32 = -1;
/// Streaming tokens update in-memory state every delta, but SQLite writes are
/// coalesced so the agent loop is not blocked on a put_message per token.
const STREAM_PERSIST_MIN_INTERVAL_MS: u64 = 150;

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

#[derive(Debug, Clone)]
struct PersistedMessageState {
    message_id: String,
    created_at: u64,
    content: String,
    thinking: String,
    process_steps: Vec<MessageProcessStep>,
    tool_invocations: Vec<MessageToolInvocation>,
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
    // 新 run 的首轮恢复数据库里最近一次 provider 真实 usage，
    // 没有真实用量时不自动压缩。
    let mut latest_prompt_tokens =
        latest_provider_prompt_tokens(&app_state.db, params.session_id.as_deref());
    let mut last_tool_signature: Option<String> = None;
    let mut repeated_tool_signature_count = 0_i32;
    let mut turn_index = 0_u32;
    // 压缩判断与 composer 共用同一份真实 usage 口径：
    // 没有真实用量时不自动压缩，等下一次模型返回后再判断。
    let max_tokens = params.max_context_tokens.unwrap_or(96_000);
    let trigger_threshold = params
        .compact_trigger_threshold
        .unwrap_or(DEFAULT_COMPACT_THRESHOLD);
    let mut last_real_prompt_tokens = latest_prompt_tokens;
    // Sub-agent concurrency cap. Override via CODER_SUBAGENT_MAX_CONCURRENT
    // (defaults to 3). Values below 1 are treated as 1 so the store never
    // rejects every spawn.
    let max_concurrent = std::env::var("CODER_SUBAGENT_MAX_CONCURRENT")
        .ok()
        .and_then(|value| value.trim().parse::<usize>().ok())
        .filter(|value| *value >= 1)
        .unwrap_or(3);
    let concurrent_agents = Arc::new(ConcurrentAgentStore::new(max_concurrent));

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

        // NOTE: Tool-result stubbing (`compact_tool_result_messages`) was
        // intentionally removed. Running it every loop iteration mutated the
        // context prefix on each turn, which destroyed prompt-cache hits and
        // forced the model to re-read files (and re-reads then bloated the
        // context further). Session bounds are already enforced by the
        // threshold-based semantic compaction below; individual tool outputs
        // are capped (e.g. read_file MAX_OUTPUT_BYTES). Keeping the full window
        // stable is the better trade.

        // ── Auto-compact check (replaces the old session rollover mechanism) ──
        //
        // When estimated token usage exceeds the threshold we compact in-place:
        //  1. Take a snapshot of the current working context
        //  2. Ask the LLM to write a concise summary (natural language)
        //  3. Replace old messages with the summary + recent tail
        //  4. Continue the loop with the compacted message list
        //
        // This avoids the cost of creating a new DB session and keeps agent
        // continuity within the same window.
        // 只用真实 usage 判断；没有真实用量时不自动压缩，
        // 等下一次模型返回后再判断。
        let prompt_estimate = last_real_prompt_tokens.unwrap_or(0);
        let token_trigger = last_real_prompt_tokens.is_some()
            && should_trigger_compact(
                prompt_estimate,
                max_tokens,
                Some(trigger_threshold),
            );
        if token_trigger {
            log::info!(
                "auto_compact_triggered task_id={} session_id={:?} used_tokens={} max_tokens={} threshold={}",
                params.task_id,
                params.session_id,
                prompt_estimate,
                max_tokens,
                trigger_threshold
            );

            emit_event(
                &registry,
                &broadcaster,
                &params.task_id,
                AgentEvent::CompactStarted {
                    task_id: params.task_id.clone(),
                    estimated_tokens: prompt_estimate,
                    max_tokens,
                    source: "auto".to_string(),
                },
            )?;
            if let Some(state) = persisted_state.as_mut() {
                upsert_compact_process_step(
                    &mut state.process_steps,
                    CompactProcessStepPatch {
                        state: "running",
                        removed_count: 0,
                        preview: "",
                        compact_message_id: None,
                    },
                );
                let _ = persist_message_snapshot(
                    &app_state.db,
                    state,
                    MessageStatusPatch {
                        status: Some("streaming"),
                        error: None,
                        usage: None,
                        duration_ms: None,
                    },
                );
            }

            let snapshot = build_compact_snapshot(
                Vec::new(),  // working_files — populated downstream if needed
                workspace_dir.clone(),
                Vec::new(),  // recent_errors
                Vec::new(),  // decisions
                Vec::new(),  // background_tasks
            );

            match run_compact(
                &http_client,
                &params.base_url,
                params.api_key.as_deref().unwrap_or_default(),
                &params.model,
                &messages,
                &snapshot,
            )
            .await
            {
                Ok(summary) => {
                    let result = apply_compact(&messages, &summary);
                    log::info!(
                        "auto_compact_applied task_id={} session_id={:?} removed={} remaining={}",
                        params.task_id,
                        params.session_id,
                        result.removed_count,
                        result.messages.len()
                    );
                    let persisted = match persist_compact_for_task(
                        &app_state.db,
                        params.session_id.as_deref(),
                        &summary,
                    ) {
                        Ok(persisted) => persisted,
                        Err(error) => {
                            log::error!(
                                "auto_compact_persist_failed task_id={} session_id={:?} error={}",
                                params.task_id,
                                params.session_id,
                                error
                            );
                            return Err(AgentLoopError::Other(format!(
                                "compact persist failed: {error}"
                            )));
                        }
                    };
                    messages = result.messages;

                    if let Some(state) = persisted_state.as_mut() {
                        let effective_removed = persisted
                            .removed_count
                            .max(result.removed_count);
                        upsert_compact_process_step(
                            &mut state.process_steps,
                            CompactProcessStepPatch {
                                state: "completed",
                                removed_count: effective_removed as u32,
                                preview: &summary.text,
                                compact_message_id: (!persisted.compact_message_id.is_empty())
                                    .then_some(persisted.compact_message_id.as_str()),
                            },
                        );
                        let _ = persist_message_snapshot(
                            &app_state.db,
                            state,
                            MessageStatusPatch {
                                status: Some("streaming"),
                                error: None,
                                usage: None,
                                duration_ms: None,
                            },
                        );
                    }
                    emit_event(
                        &registry,
                        &broadcaster,
                        &params.task_id,
                        compact_completed_event(
                            &params.task_id,
                            &summary.text,
                            result.removed_count,
                            Some(&persisted),
                            "auto",
                        ),
                    )?;
                }
                Err(error) => {
                    log::error!(
                        "auto_compact_failed task_id={} session_id={:?} error={}",
                        params.task_id,
                        params.session_id,
                        error
                    );
                    if let Some(state) = persisted_state.as_mut() {
                        upsert_compact_process_step(
                            &mut state.process_steps,
                            CompactProcessStepPatch {
                                state: "error",
                                removed_count: 0,
                                preview: "",
                                compact_message_id: None,
                            },
                        );
                        let _ = persist_message_snapshot(
                            &app_state.db,
                            state,
                            MessageStatusPatch {
                                status: Some("streaming"),
                                error: None,
                                usage: None,
                                duration_ms: None,
                            },
                        );
                    }
                    return Err(AgentLoopError::Other(format!(
                        "auto compact failed: {error}"
                    )));
                }
            }
        }

        // ── Manual compact check ──
        //
        // The /api/compact route sets a flag in AgentRegistry. On the next
        // loop cycle we consume it and trigger an immediate compaction
        // regardless of token budget. This lets the user manually request
        // a compact via slash command or frontend action.
        let manual_requested = {
            let mut reg = registry.lock().map_err(|_| AgentLoopError::Cancelled)?;
            reg.consume_compact_request(&params.task_id)
                .is_some()
        };
        if manual_requested {
            log::info!(
                "manual_compact_requested task_id={} session_id={:?}",
                params.task_id,
                params.session_id
            );

            let snapshot = build_compact_snapshot(
                Vec::new(),
                workspace_dir.clone(),
                Vec::new(),
                Vec::new(),
                Vec::new(),
            );

            match run_compact(
                &http_client,
                &params.base_url,
                params.api_key.as_deref().unwrap_or_default(),
                &params.model,
                &messages,
                &snapshot,
            )
            .await
            {
                Ok(summary) => {
                    let result = apply_compact(&messages, &summary);
                    log::info!(
                        "manual_compact_applied task_id={} session_id={:?} removed={}",
                        params.task_id,
                        params.session_id,
                        result.removed_count
                    );
                    let persisted = match persist_compact_for_task(
                        &app_state.db,
                        params.session_id.as_deref(),
                        &summary,
                    ) {
                        Ok(persisted) => persisted,
                        Err(error) => {
                            log::error!(
                                "manual_compact_persist_failed task_id={} session_id={:?} error={}",
                                params.task_id,
                                params.session_id,
                                error
                            );
                            return Err(AgentLoopError::Other(format!(
                                "compact persist failed: {error}"
                            )));
                        }
                    };
                    messages = result.messages;
                    emit_event(
                        &registry,
                        &broadcaster,
                        &params.task_id,
                        compact_completed_event(
                            &params.task_id,
                            &summary.text,
                            result.removed_count,
                            Some(&persisted),
                            "manual",
                        ),
                    )?;
                }
                Err(error) => {
                    log::error!(
                        "manual_compact_failed task_id={} session_id={:?} error={}",
                        params.task_id,
                        params.session_id,
                        error
                    );
                    if let Some(state) = persisted_state.as_mut() {
                        upsert_compact_process_step(
                            &mut state.process_steps,
                            CompactProcessStepPatch {
                                state: "error",
                                removed_count: 0,
                                preview: "",
                                compact_message_id: None,
                            },
                        );
                        let _ = persist_message_snapshot(
                            &app_state.db,
                            state,
                            MessageStatusPatch {
                                status: Some("streaming"),
                                error: None,
                                usage: None,
                                duration_ms: None,
                            },
                        );
                    }
                    return Err(AgentLoopError::Other(format!(
                        "manual compact failed: {error}"
                    )));
                }
            }
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
            latest_prompt_tokens = Some(usage.prompt_tokens);
            last_real_prompt_tokens = Some(usage.prompt_tokens);
            cumulative_usage = Some(match cumulative_usage.as_ref() {
                Some(acc) => merge_usage(acc, usage),
                None => usage.clone(),
            });
            let last_message_id = persisted_state
                .as_ref()
                .map(|state| state.message_id.as_str());
            persist_context_usage_snapshot(
                &app_state.db,
                params.session_id.as_deref(),
                usage.prompt_tokens,
                max_tokens,
                trigger_threshold,
                "provider",
                last_message_id,
            );

            // Persist the latest token usage to DB now so the Composer uses real
            // values during the agent loop instead of heuristic estimates.
            if let Some(state) = persisted_state.as_mut() {
                let display_usage = build_display_usage(latest_prompt_tokens, cumulative_usage.as_ref());
                persist_message_snapshot(
                    &app_state.db,
                    state,
                    MessageStatusPatch {
                        status: Some("streaming"),
                        error: None,
                        usage: Some(display_usage),
                        duration_ms: None,
                    },
                )?;
            }
        }

        if turn.tool_calls.is_empty() {
            let session_kind = params.session_kind.as_deref().unwrap_or("standard");
            let autonomy_mode = params.autonomy_mode.as_deref().unwrap_or("interactive");
            if session_kind == "long_task" || autonomy_mode == "unattended" {
                let decision_request = build_final_answer_decision_request(
                    params.session_id.as_deref().unwrap_or_default(),
                    &params.task_id,
                    &turn.content,
                    session_kind,
                    autonomy_mode,
                    params
                        .decision_policy_version
                        .as_deref()
                        .unwrap_or("mvp-v1"),
                );
                let decision_id = format!("decision:{}", turn_index);
                emit_event(
                    &registry,
                    &broadcaster,
                    &params.task_id,
                    AgentEvent::DecisionRequested {
                        task_id: params.task_id.clone(),
                        decision_id: decision_id.clone(),
                        trigger: decision_request.trigger.clone(),
                        summary: decision_request.summary.clone(),
                        question: decision_request.question.clone(),
                        options: decision_request.options.clone(),
                        risk_level: "medium".to_string(),
                        requires_user_confirmation: false,
                    },
                )?;
                if let Some(state) = persisted_state.as_mut() {
                    state.process_steps.push(MessageProcessStep::Decision {
                        id: decision_id.clone(),
                        trigger: decision_request.trigger.clone(),
                        summary: decision_request.summary.clone(),
                        question: decision_request.question.clone(),
                        options: decision_request
                            .options
                            .iter()
                            .map(|option| DecisionOptionRecord {
                                id: option.id.clone(),
                                label: option.label.clone(),
                            })
                            .collect(),
                        risk_level: "medium".to_string(),
                        status: "requested".to_string(),
                        requires_user_confirmation: false,
                        response: None,
                    });
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

                let decision_response = request_proxy_decision(
                    &http_client,
                    &params.base_url,
                    params.api_key.as_deref().unwrap_or_default(),
                    params
                        .decision_model
                        .as_deref()
                        .filter(|value| !value.trim().is_empty())
                        .unwrap_or(&params.model),
                    &decision_request,
                    &messages,
                )
                .await
                .unwrap_or_else(|error| DecisionResponse {
                    outcome: "complete".to_string(),
                    selected_option_id: Some("complete".to_string()),
                    reason: format!(
                        "Proxy decision failed, so the task was finalized with the current assistant answer: {error}"
                    ),
                    risk_level: "medium".to_string(),
                    record_as_assumption: false,
                    requires_user_confirmation: false,
                    assumption: None,
                    suggested_continuation: None,
                });

                emit_event(
                    &registry,
                    &broadcaster,
                    &params.task_id,
                    AgentEvent::DecisionResolved {
                        task_id: params.task_id.clone(),
                        decision_id: decision_id.clone(),
                        trigger: decision_request.trigger.clone(),
                        summary: decision_request.summary.clone(),
                        question: decision_request.question.clone(),
                        options: decision_request.options.clone(),
                        response: decision_response.clone(),
                    },
                )?;
                if let Some(state) = persisted_state.as_mut() {
                    if let Some(MessageProcessStep::Decision { response, status, .. }) =
                        state.process_steps.iter_mut().find(|step| {
                            matches!(step, MessageProcessStep::Decision { id, .. } if id == &decision_id)
                        })
                    {
                        *status = "resolved".to_string();
                        *response = Some(DecisionResponseRecord {
                            outcome: decision_response.outcome.clone(),
                            selected_option_id: decision_response.selected_option_id.clone(),
                            reason: decision_response.reason.clone(),
                            risk_level: decision_response.risk_level.clone(),
                            record_as_assumption: decision_response.record_as_assumption,
                            requires_user_confirmation: decision_response.requires_user_confirmation,
                            assumption: decision_response.assumption.clone(),
                            suggested_continuation: decision_response.suggested_continuation.clone(),
                        });
                    }
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
                if decision_response.outcome == "continue" {
                    messages.push(build_assistant_message(&turn));
                    messages.push(build_proxy_continuation_message(&decision_response));
                    continue;
                }
            }

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
                let display_usage = build_display_usage(latest_prompt_tokens, cumulative_usage.as_ref());
                persist_message_snapshot(
                    &app_state.db,
                    state,
                    MessageStatusPatch {
                        status: Some("completed"),
                        error: None,
                        usage: Some(display_usage),
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
        if TOOL_STALL_THRESHOLD > 0
            && is_stalled(&mut last_tool_signature, &mut repeated_tool_signature_count, &tool_signature)
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
                concurrent_agents: concurrent_agents.clone(),
                tool_result_message_id: persisted_state
                    .as_ref()
                    .map(|s| s.message_id.clone()),
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
    let mut last_stream_persist_ms = 0_u64;

    let emit_assistant_output = params.emit_assistant_output.unwrap_or(true);

    // Strip __-prefixed private fields from tool role messages before
    // sending to the LLM. These fields (e.g. __progress) are for UI /
    // persistence only and should not be visible to the model.
    let stripped_messages: Vec<ChatMessage> = messages
        .iter()
        .map(|msg| {
            if msg.role != "tool" {
                return msg.clone();
            }
            let Some(ref content) = msg.content else {
                return msg.clone();
            };
            let content_str = match content {
                Value::String(s) => s.as_str(),
                _ => return msg.clone(),
            };
            let Ok(mut value) = serde_json::from_str::<serde_json::Value>(content_str) else {
                return msg.clone();
            };
            // Recursively strip __-prefixed private fields from the entire
            // tool result value, not just the top level. Fields like data.__progress
            // must not be visible to the LLM.
            strip_private_fields(&mut value);
            let mut stripped = msg.clone();
            stripped.content = Some(Value::String(serde_json::to_string(&value).unwrap_or_else(|_| content.to_string())));
            stripped
        })
        .collect::<Vec<_>>();

    let result = stream_chat_completion(
        client,
        super::openai::chat_completions_url(&params.base_url),
        params.api_key.as_deref().unwrap_or_default(),
        params.model.as_str(),
        &stripped_messages,
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
                        maybe_persist_stream_snapshot(
                            db,
                            state,
                            &mut last_stream_persist_ms,
                            false,
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
                        maybe_persist_stream_snapshot(
                            db,
                            state,
                            &mut last_stream_persist_ms,
                            false,
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
        params.active_model_supports_multimodal(),
    )
    .await;

    // Flush any coalesced stream tokens before tools / terminal status reads
    // the persisted assistant row.
    if let Some(state) = persisted_state.as_mut() {
        maybe_persist_stream_snapshot(db, state, &mut last_stream_persist_ms, true);
    }

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
            content: Some(serialize_tool_result(&tool_result)),
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

/// Build a usage snapshot that is meaningful for the Composer context display.
///
/// Uses the *latest* `prompt_tokens` (the actual prompt size of the last API
/// call, NOT the cumulative sum) together with the cumulative `completion_tokens`
/// across all turns. This correctly represents the agent's current context-window
/// footprint without double-counting prompt tokens from prior turns.
fn build_display_usage(
    latest_prompt_tokens: Option<u32>,
    cumulative_usage: Option<&TokenUsage>,
) -> TokenUsage {
    let prompt = latest_prompt_tokens.unwrap_or(0);
    let completion = cumulative_usage
        .map(|c| c.completion_tokens)
        .unwrap_or(0);
    TokenUsage {
        prompt_tokens: prompt,
        completion_tokens: completion,
        total_tokens: prompt + completion,
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

/// 把压缩摘要写入数据库压缩记录；失败时由调用方撤销内存压缩并停止任务。
fn persist_compact_for_task(
    db: &Arc<Mutex<Database>>,
    session_id: Option<&str>,
    summary: &super::compact::CompactSummary,
) -> Result<CompactPersistResult, String> {
    persist_compact_summary(db, session_id, summary, CompactPersistOptions::default())
}

/// 取该 session 最近一条带 provider usage 的 assistant 消息的 prompt_tokens。
///
/// 用于跨 run 恢复压缩判断基线：新 run 的第一轮不应重新用全量启发式估算，
/// 而应延续上一次模型真实返回的 prompt 占用，只对新增消息做增量估算。
fn latest_provider_prompt_tokens(
    db: &Arc<Mutex<Database>>,
    session_id: Option<&str>,
) -> Option<u32> {
    let session_id = session_id?.trim();
    if session_id.is_empty() {
        return None;
    }
    let db = db.lock().ok()?;
    let messages = get_messages_by_session(&db, session_id).ok()?;
    messages
        .iter()
        .rev()
        .find_map(|message| {
            if message.role != "assistant"
                || message.message_kind.as_deref()
                    == Some(crate::db::records::MESSAGE_KIND_COMPACT)
            {
                return None;
            }
            message
                .usage
                .as_ref()
                .map(|usage| usage.prompt_tokens)
                .filter(|tokens| *tokens > 0)
        })
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
    let session = get_session(&db, session_id).ok()??;
    session.workspace_dir
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
    let message = find_assistant_message_by_task_id(&db, Some(session_id), task_id).ok()??;
    Some(PersistedMessageState {
        message_id: message.id,
        created_at: message.created_at,
        content: message.content,
        thinking: message.thinking,
        process_steps: message.process_steps.unwrap_or_default(),
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
    let Some(mut message) = crate::db::session_store::get_message(&db, &state.message_id)
        .map_err(AgentLoopError::Other)?
    else {
        return Ok(());
    };
    message.content = state.content.clone();
    message.thinking = state.thinking.clone();
    message.process_steps = Some(state.process_steps.clone());
    // Persist tool_invocations from state but preserve __progress
    // in output.data that may have been written by background progress
    // emitters (e.g. spawn_subagent) between snapshots.
    merge_tool_invocations(&mut message.tool_invocations, &state.tool_invocations);
    if let Some(status) = patch.status {
        message.status = status.to_string();
    }
    message.error = patch.error;
    if let Some(usage) = patch.usage {
        message.usage = Some(usage);
    }
    if let Some(duration_ms) = patch.duration_ms {
        message.duration_ms = Some(duration_ms);
    }
    crate::db::session_store::put_message(&db, &message, false).map_err(AgentLoopError::Other)
}

/// Merges `state_invocations` into `db_invocations` but preserves fields that
/// background emitters wrote directly to the DB between snapshots — these are
/// not reflected in the loop's in-memory `state` and would otherwise be
/// clobbered back to their initial value.
///
/// Specifically:
/// - `__progress` (output top level): written by streaming progress emitters.
/// - `status` (output top level): written by `spawn_subagent`'s completion
///   path (`emit_spawn_subagent_status_update`) once the child session reaches
///   a terminal state. The loop's in-memory copy stays `"running"` forever,
///   so without this preservation the parent message would revert to "running"
///   on reload even though the child already completed.
fn merge_tool_invocations(
    db_invocations: &mut Vec<MessageToolInvocation>,
    state_invocations: &[MessageToolInvocation],
) {
    // Collect per-invocation background-written fields from the existing DB record.
    let mut preserve_by_id: HashMap<String, (Option<serde_json::Value>, Option<String>)> =
        HashMap::new();
    for inv in db_invocations.iter() {
        let mut progress = None;
        let mut status = None;
        if let Some(output) = inv.output.as_ref().and_then(|o| o.as_object()) {
            if let Some(prog) = output.get("__progress") {
                progress = Some(prog.clone());
            }
            // Only preserve terminal statuses written by background emitters;
            // a child session moves running -> completed/cancelled/failed, never
            // the reverse. We never downgrade a terminal status to "running".
            if let Some(s) = output.get("status").and_then(|v| v.as_str()) {
                if matches!(s, "completed" | "cancelled" | "failed") {
                    status = Some(s.to_string());
                }
            }
        }
        preserve_by_id.insert(inv.id.clone(), (progress, status));
    }
    *db_invocations = state_invocations.to_vec();
    // Reapply any preserved fields into the state's invocations.
    for inv in db_invocations.iter_mut() {
        if let Some((progress, status)) = preserve_by_id.remove(&inv.id) {
            if let Some(output) = inv.output.as_mut().and_then(|o| o.as_object_mut()) {
                if let Some(prog) = progress {
                    output.insert("__progress".to_string(), prog);
                }
                if let Some(s) = status {
                    // Don't override a terminal status already present in the
                    // loop's in-memory copy (it would only ever be more accurate).
                    let state_terminal = output
                        .get("status")
                        .and_then(|v| v.as_str())
                        .map(|st| matches!(st, "completed" | "cancelled" | "failed"))
                        .unwrap_or(false);
                    if !state_terminal {
                        output.insert("status".to_string(), serde_json::Value::String(s));
                    }
                }
            }
        }
    }
}

fn maybe_persist_stream_snapshot(
    db: &Arc<Mutex<Database>>,
    state: &PersistedMessageState,
    last_persist_ms: &mut u64,
    force: bool,
) {
    let now = current_timestamp_ms();
    if !force
        && *last_persist_ms > 0
        && now.saturating_sub(*last_persist_ms) < STREAM_PERSIST_MIN_INTERVAL_MS
    {
        return;
    }
    *last_persist_ms = now.max(1);
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

fn compact_completed_event(
    task_id: &str,
    summary_text: &str,
    in_memory_removed: usize,
    persisted: Option<&CompactPersistResult>,
    source: &str,
) -> AgentEvent {
    let db_removed = persisted.map(|value| value.removed_count).unwrap_or(0);
    let removed_count = db_removed.max(in_memory_removed) as u32;
    let (first_kept_message_id, compact_message_id, anchor_after_message_id) = match persisted {
        Some(value) if value.removed_count > 0 => (
            value.first_kept_message_id.clone(),
            if value.compact_message_id.is_empty() {
                None
            } else {
                Some(value.compact_message_id.clone())
            },
            value.anchor_after_message_id.clone(),
        ),
        // Persist failed or was a noop — leave placement unset so the UI can
        // fall back to an estimate instead of inventing a false history point.
        _ => (None, None, None),
    };

    AgentEvent::CompactCompleted {
        task_id: task_id.to_string(),
        removed_count,
        summary_preview: summary_text.to_string(),
        source: source.to_string(),
        first_kept_message_id,
        compact_message_id,
        anchor_after_message_id,
    }
}

struct CompactProcessStepPatch<'a> {
    state: &'a str,
    removed_count: u32,
    preview: &'a str,
    compact_message_id: Option<&'a str>,
}

fn upsert_compact_process_step(
    steps: &mut Vec<MessageProcessStep>,
    patch: CompactProcessStepPatch<'_>,
) {
    let preview: String = patch.preview.to_string();
    let compact_message_id = patch.compact_message_id.map(str::to_string);
    let id = compact_message_id
        .as_deref()
        .map(|value| format!("compact:{value}"))
        .unwrap_or_else(|| "compact:auto".to_string());

    if let Some(existing) = steps.iter_mut().rev().find(|step| {
        matches!(
            step,
            MessageProcessStep::Compact { state, .. }
                if state == "running" || state == "error"
        ) || matches!(
            step,
            MessageProcessStep::Compact { id: existing_id, .. } if existing_id == &id
        )
    }) {
        *existing = MessageProcessStep::Compact {
            id,
            state: patch.state.to_string(),
            removed_count: patch.removed_count,
            preview,
            compact_message_id,
        };
        return;
    }

    steps.push(MessageProcessStep::Compact {
        id,
        state: patch.state.to_string(),
        removed_count: patch.removed_count,
        preview,
        compact_message_id,
    });
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

fn is_stalled(
    last_signature: &mut Option<String>,
    repeated_count: &mut i32,
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

/// 把当前上下文占用快照写入 session，composer 与压缩判断共用同一口径。
///
/// `source` 为 `provider` 时 `used_tokens` 是模型真实返回的 prompt tokens；
/// 为 `estimated` 时是压缩后对剩余消息的估算。
fn persist_context_usage_snapshot(
    db: &Arc<Mutex<Database>>,
    session_id: Option<&str>,
    used_tokens: u32,
    max_tokens: u32,
    trigger_threshold: f64,
    source: &str,
    last_message_id: Option<&str>,
) {
    let Some(session_id) = session_id.map(str::trim).filter(|value| !value.is_empty()) else {
        return;
    };
    let Ok(db) = db.lock() else {
        return;
    };
    let _ = update_session(&db, session_id, |session| {
        session.context_usage_snapshot = Some(SessionContextUsageSnapshot {
            used_tokens,
            max_tokens,
            remaining_tokens: max_tokens.saturating_sub(used_tokens),
            reserved_tokens: compact_reserve(max_tokens),
            trigger_threshold,
            source: source.to_string(),
            updated_at: current_timestamp_ms(),
            last_message_id: last_message_id.map(str::to_string),
        });
    });
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

/// Recursively removes all keys prefixed with `__` from a JSON Value.
/// This ensures private UI-only fields like `__progress` are stripped
/// regardless of their nesting depth before being sent to the LLM.
fn strip_private_fields(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(obj) => {
            obj.retain(|k, _| !k.starts_with("__"));
            for v in obj.values_mut() {
                strip_private_fields(v);
            }
        }
        serde_json::Value::Array(arr) => {
            for v in arr.iter_mut() {
                strip_private_fields(v);
            }
        }
        _ => {}
    }
}
