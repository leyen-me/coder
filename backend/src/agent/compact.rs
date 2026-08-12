//! Context Compaction — 自动 80% / 手动随时压缩。
//!
//! 压缩判断只依赖模型真实返回的 `prompt_tokens`，不做 token 估算；
//! 压缩时保留最近一段对话（字符预算），并在数据库写入压缩记录。

use serde_json::json;
use std::sync::{Arc, Mutex};

use super::compact_prompt::{COMPACT_SUMMARY_PREFIX, SUMMARIZATION_PROMPT};
use super::openai::complete_chat_completion;
use super::types::ChatMessage;
use crate::db::{session_store::persist_session_compact, Database};

/// Token budget ratio where auto-compact triggers.
pub const DEFAULT_COMPACT_THRESHOLD: f64 = 0.8;

/// Reserve ratio for the compaction round-trip.
const COMPACT_RESERVE_RATIO: f64 = 0.25;

/// Minimum tokens to reserve for compaction.
const MIN_COMPACT_RESERVE_TOKENS: u32 = 4_000;

/// Maximum tokens for the compact summary response.
const COMPACT_SUMMARY_MAX_TOKENS: u32 = 2_048;

/// 压缩后保留的最近对话字符预算（约等于旧 2 万 token 的字符量）。
///
/// 只用于选择“保留起点”，不参与上下文占用判断。
pub const COMPACT_TAIL_MAX_CHARS: usize = 40_000;

/// Max compaction retries with short backoff.
const COMPACT_MAX_RETRIES: u32 = 3;
const COMPACT_BASE_BACKOFF_MS: u64 = 500;

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
}

/// What `apply_compact` returns — the new message list plus metadata.
#[derive(Debug, Clone)]
pub struct CompactResult {
    pub messages: Vec<ChatMessage>,
    pub removed_count: usize,
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
        options.max_tail_chars,
        COMPACT_SUMMARY_PREFIX,
    )
}

#[derive(Debug, Clone, Copy)]
pub struct CompactPersistOptions {
    pub max_tail_chars: usize,
}

impl Default for CompactPersistOptions {
    fn default() -> Self {
        Self {
            max_tail_chars: COMPACT_TAIL_MAX_CHARS,
        }
    }
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

pub fn count_compactable_messages(messages: &[ChatMessage]) -> usize {
    messages
        .iter()
        .filter(|message| message.role != "system" && !is_compact_summary_message(message))
        .count()
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
// Compaction execution (with bounded retry)
// ---------------------------------------------------------------------------

/// Run the compaction LLM call. Retries up to `COMPACT_MAX_RETRIES` times.
pub async fn run_compact(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
    model: &str,
    messages: &[ChatMessage],
    snapshot: &CompactContextSnapshot,
) -> Result<CompactSummary, String> {
    let url = super::openai::chat_completions_url(base_url);
    let mut last_error: Option<String> = None;

    for attempt in 0..COMPACT_MAX_RETRIES {
        let user_context = build_compact_user_context(messages, snapshot);
        let wrapped_context = format!(
            "Please summarize the following conversation:\n\n```text\n{user_context}\n```"
        );

        let compact_messages = vec![
            ChatMessage {
                role: "system".to_string(),
                content: Some(json!(SUMMARIZATION_PROMPT)),
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
            false,
        )
        .await
        {
            Ok(Some(text)) => return Ok(CompactSummary { text }),
            Ok(None) => {
                return Ok(CompactSummary {
                    text: "Task is in progress. Continue from the messages above.".to_string(),
                });
            }
            Err(error) => {
                last_error = Some(error.clone());
                log::warn!(
                    "compact_summary_failed attempt={} error={}",
                    attempt + 1,
                    error
                );
                if attempt + 1 < COMPACT_MAX_RETRIES {
                    tokio::time::sleep(std::time::Duration::from_millis(
                        COMPACT_BASE_BACKOFF_MS * 2u64.pow(attempt),
                    ))
                    .await;
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
// Apply compaction to message list
// ---------------------------------------------------------------------------

/// Replace old messages with a compact summary and a recent tail.
///
/// 1. Keep leading real system prompts only.
/// 2. Filter out any existing compact summaries (no nested summaries).
/// 3. Select the newest messages that fit the character tail budget.
/// 4. Result = system prompts + compact summary + selected tail.
pub fn apply_compact(
    messages: &[ChatMessage],
    summary: &CompactSummary,
) -> CompactResult {
    let original_len = messages.len();

    let mut system_msgs: Vec<ChatMessage> = Vec::new();
    let mut consumed = 0usize;
    for msg in messages.iter() {
        if msg.role == "system" && !is_compact_summary_message(msg) {
            system_msgs.push(msg.clone());
            consumed += 1;
        } else if msg.role == "system" && is_compact_summary_message(msg) {
            consumed += 1;
        } else {
            break;
        }
    }

    let non_system: Vec<&ChatMessage> = messages[consumed..]
        .iter()
        .filter(|msg| !is_compact_summary_message(msg))
        .collect();

    let tail = select_tail_messages_by_chars(&non_system, COMPACT_TAIL_MAX_CHARS);

    let summary_content = format!(
        "{}## Context Compaction Summary\n\n{}",
        COMPACT_SUMMARY_PREFIX, summary.text
    );

    let mut result = system_msgs;
    result.push(ChatMessage {
        role: "system".to_string(),
        content: Some(json!(summary_content)),
        reasoning_content: None,
        tool_calls: None,
        tool_call_id: None,
        name: None,
    });
    result.extend(tail);

    let removed = original_len.saturating_sub(result.len());
    CompactResult {
        messages: result,
        removed_count: removed,
    }
}

/// Select the newest messages that fit the tail character budget.
///
/// The newest message is always kept, even if it alone exceeds the budget.
fn select_tail_messages_by_chars(
    messages: &[&ChatMessage],
    max_chars: usize,
) -> Vec<ChatMessage> {
    if messages.is_empty() {
        return Vec::new();
    }

    let mut selected: Vec<ChatMessage> = Vec::new();
    let mut remaining = max_chars;

    for msg in messages.iter().rev() {
        let chars = message_chars(msg);
        if selected.is_empty() {
            selected.push((*msg).clone());
            remaining = remaining.saturating_sub(chars);
            continue;
        }
        if chars > remaining {
            break;
        }
        selected.push((*msg).clone());
        remaining -= chars;
    }

    selected.reverse();
    selected
}

fn message_chars(msg: &ChatMessage) -> usize {
    msg.content
        .as_ref()
        .map(|v| match v {
            serde_json::Value::String(s) => s.len(),
            other => other.to_string().len(),
        })
        .unwrap_or(0)
}

/// Check if a message IS an existing compact summary.
pub fn is_compact_summary_message(msg: &ChatMessage) -> bool {
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
        assert!(!should_trigger_compact(7999, 10000, None));
        assert!(should_trigger_compact(8000, 10000, None));
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
    fn truncate_with_ellipsis_respects_utf8_char_boundaries() {
        let content = "已提交 `46ed33c`。\n\n---\n\n".repeat(40);
        let truncated = truncate_with_ellipsis(&content, 500);
        assert!(truncated.ends_with("... [truncated]"));
        assert!(truncated.is_char_boundary(truncated.len()));
    }

    #[test]
    fn apply_compact_uses_tail_char_budget() {
        let mut msgs = vec![make_msg("system", "You are an AI agent.")];
        let bulky = "lorem ipsum dolor sit amet ".repeat(400);
        for i in 0..50 {
            msgs.push(make_msg(
                if i % 2 == 0 { "user" } else { "assistant" },
                &format!("Message {i}: {bulky}"),
            ));
        }

        let summary = CompactSummary {
            text: "50-message conversation.".to_string(),
        };
        let result = apply_compact(&msgs, &summary);
        assert!(result.removed_count > 0);
        assert!(
            result.messages.len() < msgs.len(),
            "字符预算应裁剪部分旧消息"
        );
    }

    #[test]
    fn summary_deduplication_filters_old_compacts() {
        let msgs = vec![
            make_msg("system", "You are an AI agent."),
            make_msg("system", "## Context Compaction Summary\n\nold summary"),
            make_msg("user", "continue working"),
            make_msg("assistant", "ok doing work"),
        ];

        let summary = CompactSummary {
            text: "new compact.".to_string(),
        };
        let result = apply_compact(&msgs, &summary);
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
    fn compact_summary_injected_before_tail() {
        let msgs = vec![
            make_msg("system", "AGENTS.md: be excellent"),
            make_msg("user", "Quest 1"),
            make_msg("assistant", "Answer 1"),
            make_msg("user", "Quest 2"),
            make_msg("assistant", "Answer 2"),
        ];

        let summary = CompactSummary {
            text: "compacted 2 turns.".to_string(),
        };
        let result = apply_compact(&msgs, &summary);

        assert_eq!(result.messages[0].role, "system");
        assert!(result.messages[0]
            .content
            .as_ref()
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .contains("AGENTS.md"));

        let compact_pos = result.messages.iter().position(|m| {
            m.content
                .as_ref()
                .and_then(|v| v.as_str())
                .is_some_and(|s| s.contains("Context Compaction Summary"))
        });
        assert!(compact_pos.is_some(), "compact summary should be present");
        let last_user_pos = result.messages.iter().rposition(|m| m.role == "user");
        assert!(last_user_pos.is_some());
        assert!(
            compact_pos.unwrap() < last_user_pos.unwrap(),
            "compact summary should be before the kept tail"
        );
    }

    #[test]
    fn compact_reserve_has_minimum() {
        assert_eq!(compact_reserve(1000), MIN_COMPACT_RESERVE_TOKENS);
        let large = compact_reserve(100_000);
        assert!(large > MIN_COMPACT_RESERVE_TOKENS);
        assert!(large < 50_000);
    }

    #[test]
    fn tail_selection_keeps_newest_even_when_oversized() {
        let oversized = "x".repeat(100_000);
        let messages = vec![
            make_msg("user", "short old"),
            make_msg("assistant", &oversized),
        ];
        let refs: Vec<&ChatMessage> = messages.iter().collect();
        let selected = select_tail_messages_by_chars(&refs, 100);
        assert_eq!(selected.len(), 1);
        assert_eq!(selected[0].role, "assistant");
    }
}
