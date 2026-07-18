//! Context Compaction — Codex-style in-window natural language compression.
//!
//! Instead of creating a new session on token overflow (the old "handoff"
//! mechanism), we ask the LLM to write a concise handoff summary in natural
//! language. The old messages are replaced by that summary, freeing context
//! space without the cost of a session switch.
//!
//! Architecture:
//!   1. `should_trigger_compact()` — token-budget-aware trigger
//!   2. `build_compact_snapshot()` — collect working-set fragments
//!   3. `run_compact()` — call the LLM with a short, natural-language prompt
//!   4. `apply_compact()` — replace old messages with the summary

use serde_json::json;

use super::compact_prompt::{COMPACT_SUMMARY_PREFIX, MICRO_COMPACT_PROMPT, SUMMARIZATION_PROMPT};
use super::openai::complete_chat_completion;
use super::types::ChatMessage;

/// How many token-estimation slots we keep for the last N messages before
/// deciding the agent is running out of runway.
const DEFAULT_COMPACT_THRESHOLD: f64 = 0.85;

/// Reserve ratio: how much of the remaining context window we reserve for
/// the compaction round-trip itself (LLM call + summary).
const COMPACT_RESERVE_RATIO: f64 = 0.25;

/// Minimum tokens to reserve for compaction, regardless of window size.
const MIN_COMPACT_RESERVE_TOKENS: u32 = 4_000;

/// Maximum tokens for the compact summary response.
const COMPACT_SUMMARY_MAX_TOKENS: u32 = 2_048;

/// How many recent full tool results to keep (per result role).
/// A small window preserves immediate context while older results are
/// represented in the snapshot.
const COMPACT_TOOL_RESULT_KEEP: usize = 4;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// A snapshot of the agent's current state at compaction time.
///
/// Collected just before the compaction LLM call so the summary prompt
/// includes concrete details about files, errors, and progress.
#[derive(Debug, Clone)]
pub struct CompactContextSnapshot {
    /// Recently touched file paths.
    pub working_files: Vec<String>,
    /// Summary of the current working directory / project state.
    pub cwd_state: Option<String>,
    /// Recent errors encountered.
    pub recent_errors: Vec<String>,
    /// Key decisions made by the agent.
    pub decisions: Vec<String>,
    /// Any background tasks still running.
    pub background_tasks: Vec<String>,
}

/// The result of a successful compaction.
#[derive(Debug, Clone)]
pub struct CompactSummary {
    /// The LLM-generated summary text.
    pub text: String,
    /// Whether the compact was done in micro mode (ultra-tight budget).
    pub micro_mode: bool,
}

// ---------------------------------------------------------------------------
// Trigger logic
// ---------------------------------------------------------------------------

/// Returns `true` when the agent should compact its context.
///
/// Uses a token-budget heuristic: when used tokens exceed `threshold * max`,
/// compaction is triggered.
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

/// Compute reserved tokens for the compaction round-trip.
pub fn compact_reserve(max_tokens: u32) -> u32 {
    let reserve = (max_tokens as f64 * COMPACT_RESERVE_RATIO) as u32;
    reserve.max(MIN_COMPACT_RESERVE_TOKENS)
}

/// Decide whether to use the micro-compaction prompt (when budget is really
/// tight).
pub fn is_micro_compact_mode(remaining_tokens: u32) -> bool {
    remaining_tokens < COMPACT_SUMMARY_MAX_TOKENS * 2
}

// ---------------------------------------------------------------------------
// Context snapshot
// ---------------------------------------------------------------------------

/// Build a compact context snapshot from the current agent state.
///
/// This is called just before compaction to capture what the agent has been
/// working on. The snapshot is injected into the compaction prompt so the
/// summary includes concrete details.
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
// Compaction execution
// ---------------------------------------------------------------------------

/// Run the compaction LLM call and return the summary.
///
/// This is the heart of the compaction system. It:
/// 1. Collects user-facing messages and tool call context
/// 2. Builds a compact prompt that includes the snapshot
/// 3. Calls the LLM (non-streaming, quick turn)
/// 4. Returns the summary
pub async fn run_compact(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
    model: &str,
    messages: &[ChatMessage],
    snapshot: &CompactContextSnapshot,
    micro_mode: bool,
) -> Result<CompactSummary, String> {
    let prompt = if micro_mode {
        MICRO_COMPACT_PROMPT
    } else {
        SUMMARIZATION_PROMPT
    };

    let user_context = build_compact_user_context(messages, snapshot);

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
            content: Some(json!(user_context)),
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: None,
            name: None,
        },
    ];

    let url = super::openai::chat_completions_url(base_url);

    let summary_text = complete_chat_completion(
        client,
        url,
        api_key,
        model,
        &compact_messages,
        COMPACT_SUMMARY_MAX_TOKENS,
    )
    .await?
    .unwrap_or_else(|| "Task is in progress. Continue from the messages above.".to_string());

    Ok(CompactSummary {
        text: summary_text,
        micro_mode,
    })
}

/// Build the user-facing context block for the compaction prompt.
///
/// Uses a structured but natural-language format. The goal is to give
/// the model enough concrete details to write a useful summary, without
/// drowning it in defensive rules.
fn build_compact_user_context(
    messages: &[ChatMessage],
    snapshot: &CompactContextSnapshot,
) -> String {
    let mut parts: Vec<String> = Vec::new();

    // Working files
    if !snapshot.working_files.is_empty() {
        let files = snapshot.working_files.join("\n- ");
        let limit = snapshot.working_files.len();
        parts.push(format!(
            "Recently modified or examined files (most recent {limit}):\n- {files}"
        ));
    }

    // CWD / project state
    if let Some(ref cwd) = snapshot.cwd_state {
        if !cwd.is_empty() {
            parts.push(format!("Working directory state: {cwd}"));
        }
    }

    // Recent errors
    if !snapshot.recent_errors.is_empty() {
        let errors = snapshot.recent_errors.join("\n- ");
        parts.push(format!("Recent errors encountered:\n- {errors}"));
    }

    // Key decisions
    if !snapshot.decisions.is_empty() {
        let decisions = snapshot.decisions.join("\n- ");
        parts.push(format!("Key decisions made:\n- {decisions}"));
    }

    // Background tasks
    if !snapshot.background_tasks.is_empty() {
        let tasks = snapshot.background_tasks.join("\n- ");
        parts.push(format!("Background tasks still running:\n- {tasks}"));
    }

    // Recent conversation summary (last N messages, compacted)
    let recent_messages = collect_recent_context(messages);
    if !recent_messages.is_empty() {
        parts.push(format!(
            "Recent conversation excerpt (for context):\n{}",
            recent_messages
        ));
    }

    parts.join("\n\n---\n\n")
}

/// Collect the most recent conversation context for the compaction prompt.
///
/// Extracts user messages and assistant thinking, skipping tool-result
/// blobs that would overwhelm the compaction request.
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
                        // Multimodal: extract text parts only
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

            // Truncate long messages for the prompt
            let truncated = if content.len() > 500 {
                format!("{}... [truncated]", &content[..500])
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

/// Replace old messages with a compact summary system message.
///
/// Strategy (learned from Codex):
/// - Keep the initial system message(s) — they define the agent's identity.
/// - Keep the last N tool result messages for immediate context.
/// - Replace everything else with a single compact summary message.
///
/// Returns the modified message list and the count of messages removed.
pub fn apply_compact(
    messages: &[ChatMessage],
    summary: &CompactSummary,
) -> (Vec<ChatMessage>, usize) {
    let original_len = messages.len();

    let mut result: Vec<ChatMessage> = Vec::new();

    // Phase 1: Keep initial system messages (agent identity / AGENTS.md)
    let mut kept_system_count = 0;
    for msg in messages.iter() {
        if msg.role == "system" {
            result.push(msg.clone());
            kept_system_count += 1;
        } else {
            break; // Stop at first non-system message
        }
    }

    // Phase 2: Compact summary — injected as a system message
    let summary_content = if summary.micro_mode {
        format!(
            "{}## Context Compaction Summary\n\n{}",
            COMPACT_SUMMARY_PREFIX, summary.text
        )
    } else {
        format!(
            "{}## Context Compaction Summary\n\n{}",
            COMPACT_SUMMARY_PREFIX, summary.text
        )
    };
    result.push(ChatMessage {
        role: "system".to_string(),
        content: Some(json!(summary_content)),
        reasoning_content: None,
        tool_calls: None,
        tool_call_id: None,
        name: None,
    });

    // Phase 3: Keep the tail messages (most recent context)
    // Skip the initial system messages we already kept
    let tail_start = if kept_system_count < messages.len() {
        // Take the last N messages as immediate context
        let tail_window = 20usize; // Keep ~20 messages of recent context
        let non_system_start = kept_system_count;
        let non_system_count = messages.len() - non_system_start;
        if non_system_count > tail_window {
            messages.len() - tail_window
        } else {
            non_system_start
        }
    } else {
        messages.len()
    };

    for msg in messages[tail_start..].iter() {
        // Don't duplicate system messages we already kept
        if msg.role == "system" {
            continue;
        }
        result.push(msg.clone());
    }

    let removed = original_len.saturating_sub(result.len());
    (result, removed)
}

/// Light-weight tool-result compaction.
///
/// Keeps the most recent full results and truncates older ones to a
/// metadata-only stub. This is purely structural — the LLM-driven
/// compact handles semantic compression.
pub fn compact_tool_result_messages(messages: &[ChatMessage]) -> Vec<ChatMessage> {
    let total = messages.len();
    if total <= COMPACT_TOOL_RESULT_KEEP {
        return messages.to_vec();
    }

    let preserve_start = total.saturating_sub(COMPACT_TOOL_RESULT_KEEP);

    messages
        .iter()
        .enumerate()
        .map(|(i, msg)| {
            if msg.role != "tool" || i >= preserve_start {
                return msg.clone();
            }

            // Older tool result: replace with metadata stub
            let stub = build_tool_result_stub(msg);
            ChatMessage {
                role: "tool".to_string(),
                content: Some(json!(stub)),
                reasoning_content: None,
                tool_calls: None,
                tool_call_id: msg.tool_call_id.clone(),
                name: msg.name.clone(),
            }
        })
        .collect()
}

fn build_tool_result_stub(msg: &ChatMessage) -> String {
    let content_preview = msg
        .content
        .as_ref()
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if content_preview.len() <= 200 {
        return format!("[compacted tool result] {}", content_preview);
    }

    format!(
        "[compacted] {}... [{} chars]",
        &content_preview[..200],
        content_preview.len()
    )
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
        assert!(should_trigger_compact(10000, 10000, None));
    }

    #[test]
    fn micro_mode_on_tight_budget() {
        assert!(!is_micro_compact_mode(5000));
        assert!(is_micro_compact_mode(2000));
    }

    #[test]
    fn compact_tool_results_keeps_tail() {
        let msgs: Vec<ChatMessage> = (0..10)
            .map(|i| make_msg("tool", &format!("result {i}")))
            .collect();

        let compacted = compact_tool_result_messages(&msgs);
        assert_eq!(compacted.len(), 10);

        // The last 4 should be unchanged
        for i in 6..10 {
            assert_eq!(
                compacted[i].content.as_ref().and_then(|v| v.as_str()),
                Some(&*format!("result {i}"))
            );
        }

        // Earlier ones should be stubs
        for i in 0..6 {
            let c = compacted[i]
                .content
                .as_ref()
                .and_then(|v| v.as_str())
                .unwrap_or("");
            assert!(c.contains("[compacted"), "expected stub at {i}, got: {c}");
        }
    }

    #[test]
    fn apply_compact_preserves_system_messages() {
        // Build a message list with 25+ non-system messages so the
        // tail-window compaction actually removes some.
        let mut msgs = vec![
            make_msg("system", "You are an AI agent."),
            make_msg("system", "Additional system context."),
        ];
        for i in 0..30 {
            msgs.push(make_msg(
                if i % 2 == 0 { "user" } else { "assistant" },
                &format!("Message {i}: lorem ipsum dolor sit amet"),
            ));
        }

        let summary = CompactSummary {
            text: "Long conversation with 30 messages about lorem ipsum.".to_string(),
            micro_mode: false,
        };

        let (compacted, removed) = apply_compact(&msgs, &summary);

        // System messages preserved
        assert_eq!(compacted[0].role, "system");
        assert_eq!(compacted[1].role, "system");

        // Summary injected as system message
        assert_eq!(compacted[2].role, "system");
        let summary_content = compacted[2]
            .content
            .as_ref()
            .and_then(|v| v.as_str())
            .unwrap_or("");
        assert!(summary_content.contains("Context Compaction Summary"));
        assert!(summary_content.contains("lorem ipsum"));

        // Some messages removed — 32 total → 2 system + 1 summary + 20 tail = 23
        assert!(removed > 0);
        assert_eq!(compacted.len(), 2 + 1 + 20); // 2 system + summary + tail
    }

    #[test]
    fn compact_reserve_has_minimum() {
        assert_eq!(compact_reserve(1000), MIN_COMPACT_RESERVE_TOKENS);
        let large = compact_reserve(100_000);
        assert!(large > MIN_COMPACT_RESERVE_TOKENS);
        assert!(large < 50_000); // Should be ~25% of max
    }
}
