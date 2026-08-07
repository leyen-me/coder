//! Context Compaction — Codex-style in-window natural language compression.
//!
//! When the agent approaches its token budget, we ask the LLM to write a
//! concise summary in natural language. Old messages are replaced by that
//! summary, freeing context space without a session switch.
//!
//! Key improvements over the original session rollover mechanism (learned from Codex & Claude Code):
//!  - Token-budget-aware user message selection (not blind "keep 20")
//!  - Summary deduplication (no nested summaries)
//!  - Initial context injected before last real user message (model-expected boundary)
//!  - Exponential backoff on compaction failures
//!  - Token estimate recomputed after compaction

use serde_json::json;
use std::sync::{Arc, Mutex};

use super::compact_prompt::{COMPACT_SUMMARY_PREFIX, MICRO_COMPACT_PROMPT, SUMMARIZATION_PROMPT};
use super::openai::complete_chat_completion;
use super::types::ChatMessage;
use crate::db::{session_store::persist_session_compact, Database};

/// Token budget ratio where auto-compact triggers.
const DEFAULT_COMPACT_THRESHOLD: f64 = 0.85;

/// Reserve ratio for the compaction round-trip.
const COMPACT_RESERVE_RATIO: f64 = 0.25;

/// Minimum tokens to reserve for compaction.
const MIN_COMPACT_RESERVE_TOKENS: u32 = 4_000;

/// Maximum tokens for the compact summary response.
const COMPACT_SUMMARY_MAX_TOKENS: u32 = 2_048;

/// Maximum tokens to spend on user messages in the compacted replacement
/// history. Messages are selected from newest to oldest until this budget is
/// exhausted — same approach Codex uses (COMPACT_USER_MESSAGE_MAX_TOKENS).
pub const COMPACT_USER_MESSAGE_MAX_TOKENS: u32 = 20_000;

/// Tail budget used when force-compacting in dev/test (keep only recent tail).
const FORCE_COMPACT_TAIL_TOKEN_BUDGET: u32 = 512;

/// Controls whether `/api/compact` may honor `force: true`.
pub fn allow_force_compact() -> bool {
    cfg!(debug_assertions)
        || std::env::var("CODER_ALLOW_FORCE_COMPACT")
            .ok()
            .is_some_and(|value| matches!(value.as_str(), "1" | "true" | "yes"))
}

/// Dev-only auto-compact cadence.
///
/// Set both `CODER_ALLOW_DEV_AUTO_COMPACT=1` and
/// `CODER_AUTO_COMPACT_EVERY_N_MESSAGES=N` to trigger auto-compact after
/// every N conversation messages (excluding system / compact-summary rows).
/// Unset either variable to disable.
///
/// This guard applies to **all** builds — debug and release. Use the
/// `dev:server:auto-compact` npm script to set both variables together.
pub fn dev_auto_compact_every_n_messages() -> Option<usize> {
    // Require explicit opt-in in all builds (debug or release).  Relying on
    // cfg!(debug_assertions) was brittle: CODER_AUTO_COMPACT_EVERY_N_MESSAGES
    // could leak from the shell environment and activate auto-compact even
    // with `dev:server` – exactly what you don't want when testing.
    let allowed = std::env::var("CODER_ALLOW_DEV_AUTO_COMPACT")
        .ok()
        .is_some_and(|value| matches!(value.as_str(), "1" | "true" | "yes"));
    if !allowed {
        return None;
    }

    std::env::var("CODER_AUTO_COMPACT_EVERY_N_MESSAGES")
        .ok()
        .and_then(|value| value.trim().parse::<usize>().ok())
        .filter(|value| *value >= 2)
}

/// Count messages that participate in the compact trigger window.
pub fn count_compactable_messages(messages: &[ChatMessage]) -> usize {
    messages
        .iter()
        .filter(|message| message.role != "system" && !is_compact_summary_message(message))
        .count()
}

/// 判断 dev 消息数节奏是否应触发自动压缩。
///
/// `baseline` 是当前 run 开始时的可见历史消息数，或上一次压缩后的消息数；
/// 只有新增消息达到 `CODER_AUTO_COMPACT_EVERY_N_MESSAGES` 时才触发。
/// 这样压缩后保留的历史消息不会在新 run 首轮立即再次触发压缩。
pub fn should_trigger_dev_auto_compact(
    messages: &[ChatMessage],
    baseline: usize,
) -> bool {
    let Some(every_n) = dev_auto_compact_every_n_messages() else {
        return false;
    };
    let count = count_compactable_messages(messages);
    count >= 2 && count >= baseline.saturating_add(every_n)
}

pub fn resolve_compact_tail_token_budget(force: bool) -> u32 {
    if force && allow_force_compact() {
        return std::env::var("CODER_FORCE_COMPACT_TAIL_TOKEN_BUDGET")
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(FORCE_COMPACT_TAIL_TOKEN_BUDGET);
    }

    std::env::var("CODER_COMPACT_TAIL_TOKEN_BUDGET")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(COMPACT_USER_MESSAGE_MAX_TOKENS)
}

#[derive(Debug, Clone, Copy)]
pub struct CompactPersistOptions {
    pub max_tail_tokens: u32,
    pub force: bool,
}

impl Default for CompactPersistOptions {
    fn default() -> Self {
        Self {
            max_tail_tokens: COMPACT_USER_MESSAGE_MAX_TOKENS,
            force: false,
        }
    }
}

impl CompactPersistOptions {
    pub fn for_manual(force: bool) -> Self {
        let effective_force = force && allow_force_compact();
        Self {
            max_tail_tokens: resolve_compact_tail_token_budget(effective_force),
            force: effective_force,
        }
    }
}

/// Max compaction retries with exponential backoff.
const COMPACT_MAX_RETRIES: u32 = 3;
const COMPACT_BASE_BACKOFF_MS: u64 = 1_500;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// A snapshot of the agent's current state at compaction time.
#[derive(Debug, Clone)]
pub struct CompactContextSnapshot {
    pub working_files: Vec<String>,
    pub cwd_state: Option<String>,
    pub recent_errors: Vec<String>,
    pub decisions: Vec<String>,
    pub background_tasks: Vec<String>,
}

/// The result of a successful compaction.
#[derive(Debug, Clone)]
pub struct CompactSummary {
    pub text: String,
    pub micro_mode: bool,
}

/// What `apply_compact` returns — the new message list plus metadata.
#[derive(Debug, Clone)]
pub struct CompactResult {
    pub messages: Vec<ChatMessage>,
    pub removed_count: usize,
    pub estimated_tokens_after: u32,
}

/// Persist a compaction summary into the session message timeline.
pub fn persist_compact_summary(
    db: &Arc<Mutex<Database>>,
    session_id: Option<&str>,
    summary: &CompactSummary,
    options: CompactPersistOptions,
) -> Result<crate::db::session_store::CompactPersistResult, String> {
    let session_id = session_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "session_id is required".to_string())?;
    let db = db
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())?;
    persist_session_compact(
        &db,
        session_id,
        summary.text.trim(),
        options.max_tail_tokens,
        COMPACT_SUMMARY_PREFIX,
        options.force,
    )
}

// ---------------------------------------------------------------------------
// Trigger logic
// ---------------------------------------------------------------------------

pub fn should_trigger_compact(
    used_tokens: u32,
    max_tokens: u32,
    threshold_override: Option<f64>,
) -> bool {
    let threshold = threshold_override.unwrap_or(DEFAULT_COMPACT_THRESHOLD);
    let max = max_tokens.max(1);
    let used = used_tokens.min(max);
    (used as f64) >= (max as f64 * threshold)
}

pub fn compact_reserve(max_tokens: u32) -> u32 {
    let reserve = (max_tokens as f64 * COMPACT_RESERVE_RATIO) as u32;
    reserve.max(MIN_COMPACT_RESERVE_TOKENS)
}

pub fn is_micro_compact_mode(remaining_tokens: u32) -> bool {
    remaining_tokens < COMPACT_SUMMARY_MAX_TOKENS * 2
}

// ---------------------------------------------------------------------------
// Context snapshot
// ---------------------------------------------------------------------------

pub fn build_compact_snapshot(
    working_files: Vec<String>,
    cwd_state: Option<String>,
    recent_errors: Vec<String>,
    decisions: Vec<String>,
    background_tasks: Vec<String>,
) -> CompactContextSnapshot {
    CompactContextSnapshot {
        working_files,
        cwd_state,
        recent_errors,
        decisions,
        background_tasks,
    }
}

// ---------------------------------------------------------------------------
// Compaction execution (with backoff retry)
// ---------------------------------------------------------------------------

/// Run the compaction LLM call with exponential backoff retry.
///
/// On failure, retries up to `COMPACT_MAX_RETRIES` times with increasing
/// delays. Falls back to micro mode on the last attempt.
pub async fn run_compact(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
    model: &str,
    messages: &[ChatMessage],
    snapshot: &CompactContextSnapshot,
    micro_mode: bool,
) -> Result<CompactSummary, String> {
    let url = super::openai::chat_completions_url(base_url);
    let mut last_error: Option<String> = None;

    for attempt in 0..=COMPACT_MAX_RETRIES {
        // Use normal prompt first, micro prompt on final retry
        let use_micro = micro_mode || attempt == COMPACT_MAX_RETRIES;
        let prompt = if use_micro {
            MICRO_COMPACT_PROMPT
        } else {
            SUMMARIZATION_PROMPT
        };

        let user_context = build_compact_user_context(messages, snapshot);
        // Wrap in a code block to visually separate "content to summarize"
        // from "instruction to follow", reducing the chance the model
        // treats it as a new task assignment.
        let wrapped_context = format!(
            "Please summarize the following conversation:\n\n```text\n{user_context}\n```"
        );

        let compact_messages = vec![
            ChatMessage {
                role: "system".to_string(),
                content: Some(json!(prompt)),
                reasoning_content: None,
                tool_calls: None,
                tool_call_id: None,
                name: None,
            },
            ChatMessage {
                role: "user".to_string(),
                content: Some(json!(wrapped_context)),
                reasoning_content: None,
                tool_calls: None,
                tool_call_id: None,
                name: None,
            },
        ];

        match complete_chat_completion(
            client,
            url.clone(),
            api_key,
            model,
            &compact_messages,
            COMPACT_SUMMARY_MAX_TOKENS,
        )
        .await
        {
            Ok(Some(text)) => {
                return Ok(CompactSummary {
                    text,
                    micro_mode: use_micro,
                });
            }
            Ok(None) => {
                return Ok(CompactSummary {
                    text: "Task is in progress. Continue from the messages above."
                        .to_string(),
                    micro_mode: use_micro,
                });
            }
            Err(e) => {
                last_error = Some(e);
                if attempt < COMPACT_MAX_RETRIES {
                    let delay_ms = COMPACT_BASE_BACKOFF_MS * 2u64.pow(attempt);
                    tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                }
            }
        }
    }

    Err(last_error.unwrap_or_else(|| "compaction exhausted retries".to_string()))
}

fn truncate_with_ellipsis(text: &str, max_bytes: usize) -> String {
    if text.len() <= max_bytes {
        return text.to_string();
    }

    let mut end = max_bytes;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }

    format!("{}... [truncated]", &text[..end])
}

fn build_compact_user_context(
    messages: &[ChatMessage],
    snapshot: &CompactContextSnapshot,
) -> String {
    let mut parts: Vec<String> = Vec::new();

    if !snapshot.working_files.is_empty() {
        let files = snapshot.working_files.join("\n- ");
        parts.push(format!(
            "Recently modified or examined files: \n- {files}"
        ));
    }

    if let Some(ref cwd) = snapshot.cwd_state {
        if !cwd.is_empty() {
            parts.push(format!("Working directory state: {cwd}"));
        }
    }

    if !snapshot.recent_errors.is_empty() {
        let errors = snapshot.recent_errors.join("\n- ");
        parts.push(format!("Recent errors encountered:\n- {errors}"));
    }

    if !snapshot.decisions.is_empty() {
        let decisions = snapshot.decisions.join("\n- ");
        parts.push(format!("Key decisions made:\n- {decisions}"));
    }

    if !snapshot.background_tasks.is_empty() {
        let tasks = snapshot.background_tasks.join("\n- ");
        parts.push(format!("Background tasks still running:\n- {tasks}"));
    }

    let recent = collect_recent_context(messages);
    if !recent.is_empty() {
        parts.push(format!("Recent conversation excerpt:\n{recent}"));
    }

    parts.join("\n\n---\n\n")
}

fn collect_recent_context(messages: &[ChatMessage]) -> String {
    let start = if messages.len() > 30 {
        messages.len() - 30
    } else {
        0
    };

    messages[start..]
        .iter()
        .filter_map(|msg| {
            let role = &msg.role;
            if role == "system" || role == "tool" {
                return None;
            }

            let content = msg
                .content
                .as_ref()
                .and_then(|v| {
                    if let Some(s) = v.as_str() {
                        Some(s.to_string())
                    } else if let Some(arr) = v.as_array() {
                        let texts: Vec<String> = arr
                            .iter()
                            .filter_map(|item| {
                                item.get("text").and_then(|t| t.as_str()).map(|s| s.to_string())
                            })
                            .collect();
                        if texts.is_empty() {
                            None
                        } else {
                            Some(texts.join(" "))
                        }
                    } else {
                        None
                    }
                })
                .unwrap_or_default();

            if content.is_empty() {
                return None;
            }

            let truncated = if content.len() > 500 {
                truncate_with_ellipsis(&content, 500)
            } else {
                content
            };

            Some(format!("[{role}]: {truncated}"))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

// ---------------------------------------------------------------------------
// Apply compaction to message list  (revised — 6 Codex-grade improvements)
// ---------------------------------------------------------------------------

/// Replace old messages with a compact summary.
///
/// Algorithm (revised to match Codex quality):
/// 1. Keep initial system messages.
/// 2. Filter out any *existing* compact summaries (dedup — no nested summaries).
/// 3. Select user messages with token-budget awareness (not blind count).
/// 4. Inject initial context *before* the last real user message, so the
///    compact summary stays at the end (Codex's preferred layout).
/// 5. Append the compact summary as the last item.
/// 6. Recompute the token estimate.
pub fn apply_compact(
    messages: &[ChatMessage],
    summary: &CompactSummary,
) -> CompactResult {
    let original_len = messages.len();

    // Phase 1: Keep leading real system prompts only. Compact summaries that
    // happen to be system-role must not be treated as sticky prefix context.
    let mut system_msgs: Vec<ChatMessage> = Vec::new();
    let mut consumed = 0usize;
    for msg in messages.iter() {
        if msg.role == "system" && !is_compact_summary_message(msg) {
            system_msgs.push(msg.clone());
            consumed += 1;
        } else if msg.role == "system" && is_compact_summary_message(msg) {
            // Skip old compact markers in the leading stretch; they are
            // filtered again below when scanning the remainder.
            consumed += 1;
        } else {
            break;
        }
    }

    // Phase 2: Collect remaining messages, filtering out old compact
    //          summaries to prevent summary-in-summary nesting.
    let non_system: Vec<&ChatMessage> = messages[consumed..]
        .iter()
        .filter(|msg| !is_compact_summary_message(msg))
        .collect();

    // Phase 3: Select user messages within token budget (newest first).
    //          Codex uses 20 000 token budget for user messages in the
    //          compacted replacement history.
    let selected = select_user_messages_with_token_budget(&non_system, COMPACT_USER_MESSAGE_MAX_TOKENS);

    // Phase 4: Build result — initial context injected before last real
    //          user message, compact summary appended at end.
    let mut result: Vec<ChatMessage> = system_msgs;

    // Find the last real user message position (skip compact summaries).
    let last_user_idx = selected.iter().rposition(|msg| msg.role == "user");

    // Insert system context before the last real user message, so the
    // compact summary (which is a system message) stays at the very end.
    // When there are no real user messages, just put context up front.
    let context_insert_pos = match last_user_idx {
        Some(pos) => pos,
        None => 0,
    };

    // Split: everything before the last user message, then the rest.
    let tail: Vec<ChatMessage> = selected[context_insert_pos..].to_vec();
    let head: Vec<ChatMessage> = selected[..context_insert_pos].to_vec();

    // Insert system context (our compact prefix) before the last user message.
    let summary_content = format!(
        "{}## Context Compaction Summary\n\n{}",
        COMPACT_SUMMARY_PREFIX, summary.text
    );
    result.push(ChatMessage {
        role: "system".to_string(),
        content: Some(json!(summary_content)),
        reasoning_content: None,
        tool_calls: None,
        tool_call_id: None,
        name: None,
    });

    // Now add head, then tail (which starts with last real user msg)
    result.extend(head);
    result.extend(tail);

    let removed = original_len.saturating_sub(result.len());
    let estimated_tokens = estimate_prompt_tokens(&result);

    CompactResult {
        messages: result,
        removed_count: removed,
        estimated_tokens_after: estimated_tokens,
    }
}

/// Token-budget-aware user message selection (Codex-style).
///
/// Selects messages from newest to oldest, stopping when the token budget
/// is exhausted. Older messages are dropped. This is far more precise than
/// a fixed window size.
fn select_user_messages_with_token_budget(
    messages: &[&ChatMessage],
    max_tokens: u32,
) -> Vec<ChatMessage> {
    if max_tokens == 0 {
        return Vec::new();
    }

    let mut selected: Vec<ChatMessage> = Vec::new();
    let mut remaining = max_tokens;

    // Iterate newest-first
    for msg in messages.iter().rev() {
        if remaining == 0 {
            break;
        }
        let tokens = estimate_message_tokens(msg);
        if tokens <= remaining {
            selected.push((*msg).clone());
            remaining = remaining.saturating_sub(tokens);
        } else {
            // Budget exhausted — drop this and earlier messages
            break;
        }
    }

    selected.reverse(); // restore original order
    selected
}

/// Estimate tokens for a single message (character-based heuristic, ~2 chars/token).
fn estimate_message_tokens(msg: &ChatMessage) -> u32 {
    let content_len = msg
        .content
        .as_ref()
        .map(|v| match v {
            serde_json::Value::String(s) => s.len(),
            other => other.to_string().len(),
        })
        .unwrap_or(0);
    (content_len as f64 / 2.0).ceil() as u32
}

/// Estimate the total token count for a message list.
pub fn estimate_prompt_tokens(messages: &[ChatMessage]) -> u32 {
    messages.iter().map(estimate_message_tokens).sum()
}

/// Check if a message IS an existing compact summary — we skip these to
/// prevent nested summaries.
fn is_compact_summary_message(msg: &ChatMessage) -> bool {
    if msg.role != "system" {
        return false;
    }
    msg.content
        .as_ref()
        .and_then(|v| v.as_str())
        .is_some_and(|s| s.contains("Context Compaction Summary"))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn make_msg(role: &str, content: &str) -> ChatMessage {
        ChatMessage {
            role: role.to_string(),
            content: Some(json!(content)),
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: None,
            name: None,
        }
    }

    #[test]
    fn should_trigger_at_threshold() {
        assert!(!should_trigger_compact(8000, 10000, None));
        assert!(should_trigger_compact(8500, 10000, None));
    }

    #[test]
    fn count_compactable_messages_skips_system_and_summaries() {
        let messages = vec![
            make_msg("system", "You are an AI agent."),
            make_msg("system", "## Context Compaction Summary\n\nold"),
            make_msg("user", "hello"),
            make_msg("assistant", "hi"),
            make_msg("user", "again"),
        ];
        assert_eq!(count_compactable_messages(&messages), 3);
    }

    #[test]
    fn micro_mode_on_tight_budget() {
        assert!(!is_micro_compact_mode(5000));
        assert!(is_micro_compact_mode(2000));
    }

    #[test]
    fn truncate_with_ellipsis_respects_utf8_char_boundaries() {
        let content = "已提交 `46ed33c`。\n\n---\n\n".repeat(40);
        let truncated = truncate_with_ellipsis(&content, 500);
        assert!(truncated.ends_with("... [truncated]"));
        assert!(truncated.is_char_boundary(truncated.len()));
    }

    #[test]
    fn apply_compact_uses_token_budget_not_blind_count() {
        let mut msgs = vec![
            make_msg("system", "You are an AI agent."),
        ];
        // Large messages so the 20k-token user-message budget cannot keep all.
        let bulky = "lorem ipsum dolor sit amet ".repeat(400);
        for i in 0..50 {
            msgs.push(make_msg(
                if i % 2 == 0 { "user" } else { "assistant" },
                &format!("Message {i}: {bulky}"),
            ));
        }

        let summary = CompactSummary {
            text: "50-message conversation.".to_string(),
            micro_mode: false,
        };

        let result = apply_compact(&msgs, &summary);
        assert!(result.removed_count > 0);

        // Token budget (20K) should select fewer than 50 messages
        assert!(
            result.messages.len() < msgs.len(),
            "should have removed some messages via token budget"
        );
    }

    #[test]
    fn summary_deduplication_filters_old_compacts() {
        // Simulate a message list that already has a compact summary
        let msgs = vec![
            make_msg("system", "You are an AI agent."),
            make_msg("system", "## Context Compaction Summary\n\nold summary"),
            make_msg("user", "continue working"),
            make_msg("assistant", "ok doing work"),
        ];

        let summary = CompactSummary {
            text: "new compact.".to_string(),
            micro_mode: false,
        };

        let result = apply_compact(&msgs, &summary);
        // Only one compact summary should remain (the new one)
        let compact_count = result
            .messages
            .iter()
            .filter(|m| {
                m.content
                    .as_ref()
                    .and_then(|v| v.as_str())
                    .is_some_and(|s| s.contains("Context Compaction Summary"))
            })
            .count();
        assert_eq!(compact_count, 1, "should have exactly one compact summary");
    }

    #[test]
    fn initial_context_injected_before_last_user_msg() {
        let msgs = vec![
            make_msg("system", "AGENTS.md: be excellent"),
            make_msg("user", "Quest 1"),
            make_msg("assistant", "Answer 1"),
            make_msg("user", "Quest 2"),
            make_msg("assistant", "Answer 2"),
        ];

        let summary = CompactSummary {
            text: "compacted 2 turns.".to_string(),
            micro_mode: false,
        };

        let result = apply_compact(&msgs, &summary);

        // System message preserved
        assert_eq!(result.messages[0].role, "system");
        assert!(result.messages[0]
            .content
            .as_ref()
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .contains("AGENTS.md"));

        // Compact summary injected (before last user msg per Codex pattern)
        let compact_pos = result.messages.iter().position(|m| {
            m.content
                .as_ref()
                .and_then(|v| v.as_str())
                .is_some_and(|s| s.contains("Context Compaction Summary"))
        });
        assert!(compact_pos.is_some(), "compact summary should be present");

        // Last user message should appear AFTER the compact summary
        let last_user_pos = result.messages.iter().rposition(|m| m.role == "user");
        assert!(last_user_pos.is_some());
        assert!(
            compact_pos.unwrap() < last_user_pos.unwrap(),
            "compact summary should be before last user message"
        );
    }

    #[test]
    fn estimate_prompt_tokens_sums_all_messages() {
        let msgs = vec![
            make_msg("system", "hi"),
            make_msg("user", "hello world"),
        ];
        let tokens = estimate_prompt_tokens(&msgs);
        assert!(tokens > 0);
        assert!(tokens < 50);
    }

    #[test]
    fn compact_reserve_has_minimum() {
        assert_eq!(compact_reserve(1000), MIN_COMPACT_RESERVE_TOKENS);
        let large = compact_reserve(100_000);
        assert!(large > MIN_COMPACT_RESERVE_TOKENS);
        assert!(large < 50_000);
    }

    #[test]
    fn token_budget_selection_smaller_than_total() {
        let mut msgs = Vec::new();
        for i in 0..20 {
            msgs.push(make_msg("user", &format!("msg{i}: some padding text here")));
        }
        let refs: Vec<&ChatMessage> = msgs.iter().collect();
        let selected = select_user_messages_with_token_budget(&refs, 50); // tiny budget
        assert!(selected.len() < msgs.len(), "tiny budget should select fewer");
        assert!(!selected.is_empty(), "should select at least one message");
    }
}
