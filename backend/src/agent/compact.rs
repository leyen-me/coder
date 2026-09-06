//! 上下文压缩——自动 75% / 手动随时压缩。
//!
//! 压缩判断只依赖模型真实返回的 `prompt_tokens`，不做 token 估算；
//! 压缩请求保留完整原始对话，仅追加一条自然 user 指令让模型产出结构化
//! Handoff；Handoff 以 **user 消息**（kind=compact）落库并进入下一轮上下文——
//! 对模型而言就像用户发来的交接说明，不再保留"最近尾巴"，也不再注入
//! 额外的 system 摘要。

use serde_json::json;
use std::sync::{Arc, Mutex};

use super::compact_prompt::COMPACT_REQUEST_MESSAGE;
use super::openai::complete_chat_completion;
use super::types::{ChatMessage, TokenUsage};
use crate::db::{session_store::persist_session_compact, Database};

/// Token budget ratio where auto-compact triggers.
pub const DEFAULT_COMPACT_THRESHOLD: f64 = 0.75;

/// Maximum tokens for the compact handoff response.
const COMPACT_SUMMARY_MAX_TOKENS: u32 = 2_048;

/// Max compaction retries with short backoff.
const COMPACT_MAX_RETRIES: u32 = 3;
const COMPACT_BASE_BACKOFF_MS: u64 = 500;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// The result of a successful compaction (the handoff text).
#[derive(Debug, Clone)]
pub struct CompactSummary {
    pub text: String,
}

/// Persist a compaction handoff into the session message timeline.
///
/// 落库为一条 user 消息（kind=compact），并写入一个小的 usage 基线，
/// 让跨 run 的压缩判断从"新窗口很小"重新起算。
pub fn persist_compact_summary(
    db: &Arc<Mutex<Database>>,
    session_id: Option<&str>,
    summary: &CompactSummary,
) -> Result<crate::db::session_store::CompactPersistResult, String> {
    let session_id = session_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "session_id is required".to_string())?;
    let db = db
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())?;
    persist_session_compact(&db, session_id, summary.text.trim())
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

// ---------------------------------------------------------------------------
// Compaction execution (with bounded retry)
// ---------------------------------------------------------------------------

/// 构建压缩请求：保留完整原始消息，仅追加一条自然 user 指令。
fn build_compact_request_messages(messages: &[ChatMessage]) -> Vec<ChatMessage> {
    let mut compact_messages = messages.to_vec();
    compact_messages.push(ChatMessage {
        role: "user".to_string(),
        content: Some(json!(COMPACT_REQUEST_MESSAGE)),
        reasoning_content: None,
        tool_calls: None,
        tool_call_id: None,
        name: None,
    });
    compact_messages
}

/// 执行压缩 handoff 调用，失败时最多重试 `COMPACT_MAX_RETRIES` 次。
pub async fn run_compact(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
    model: &str,
    messages: &[ChatMessage],
) -> Result<CompactSummary, String> {
    let url = super::openai::chat_completions_url(base_url);
    let mut last_error: Option<String> = None;
    let compact_messages = build_compact_request_messages(messages);

    for attempt in 0..COMPACT_MAX_RETRIES {
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

/// 压缩后内存上下文 = system prompts + handoff user 消息。
///
/// 不保留最近尾巴：handoff 本身描述了进度与下一步，模型缺什么会用工具补。
pub fn apply_compact(messages: &[ChatMessage], summary: &CompactSummary) -> Vec<ChatMessage> {
    let mut result = Vec::new();
    for message in messages.iter() {
        if message.role != "system" {
            break;
        }
        result.push(message.clone());
    }
    result.push(ChatMessage {
        role: "user".to_string(),
        content: Some(json!(summary.text.trim())),
        reasoning_content: None,
        tool_calls: None,
        tool_call_id: None,
        name: None,
    });
    result
}

/// 压缩后写入的 usage 基线：新窗口 ≈ system prompt + handoff，远小于触发阈值。
pub fn post_compact_usage_baseline() -> TokenUsage {
    TokenUsage {
        prompt_tokens: 1_024,
        completion_tokens: 0,
        total_tokens: 1_024,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

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
        assert!(!should_trigger_compact(7499, 10_000, None));
        assert!(should_trigger_compact(7500, 10_000, None));
    }

    #[test]
    fn apply_compact_keeps_system_and_handoff_user_message() {
        let msgs = vec![
            make_msg("system", "AGENTS.md: be excellent"),
            make_msg("user", "Quest 1"),
            make_msg("assistant", "Answer 1"),
            make_msg("user", "Quest 2"),
            make_msg("assistant", "Answer 2"),
        ];

        let summary = CompactSummary {
            text: "# Handoff\n\nprogress...".to_string(),
        };
        let result = apply_compact(&msgs, &summary);

        assert_eq!(result.len(), 2);
        assert_eq!(result[0].role, "system");
        assert!(result[0]
            .content
            .as_ref()
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .contains("AGENTS.md"));
        // Handoff 是 user 消息，不是 system。
        assert_eq!(result[1].role, "user");
        assert!(result[1]
            .content
            .as_ref()
            .and_then(Value::as_str)
            .unwrap_or_default()
            .contains("Handoff"));
    }

    #[test]
    fn apply_compact_trims_handoff_whitespace() {
        let msgs = vec![make_msg("system", "sys")];
        let summary = CompactSummary {
            text: "  handoff body  ".to_string(),
        };
        let result = apply_compact(&msgs, &summary);
        assert_eq!(
            result[1]
                .content
                .as_ref()
                .and_then(Value::as_str)
                .unwrap_or_default(),
            "handoff body"
        );
    }

    #[test]
    fn apply_compact_without_system_starts_with_handoff() {
        let msgs = vec![make_msg("user", "hello")];
        let summary = CompactSummary {
            text: "handoff".to_string(),
        };
        let result = apply_compact(&msgs, &summary);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].role, "user");
    }

    #[test]
    fn compact_request_keeps_full_conversation_and_appends_user_instruction() {
        let messages = vec![
            make_msg("system", "AGENTS.md: use Simplified Chinese"),
            make_msg("user", "实现 compact"),
            make_msg("assistant", "好的，正在修改"),
        ];

        let request = build_compact_request_messages(&messages);
        assert_eq!(request.len(), messages.len() + 1);

        let source_roles: Vec<&str> = request[..messages.len()]
            .iter()
            .map(|message| message.role.as_str())
            .collect();
        assert_eq!(source_roles, vec!["system", "user", "assistant"]);
        let source_contents: Vec<Option<Value>> = messages
            .iter()
            .map(|message| message.content.clone())
            .collect();
        let request_contents: Vec<Option<Value>> = request[..messages.len()]
            .iter()
            .map(|message| message.content.clone())
            .collect();
        assert_eq!(request_contents, source_contents);

        let last = request.last().unwrap();
        assert_eq!(last.role, "user");
        assert!(last
            .content
            .as_ref()
            .and_then(Value::as_str)
            .unwrap_or_default()
            .contains("Coder Handoff"));
    }

    #[test]
    fn post_compact_baseline_stays_below_trigger() {
        let baseline = post_compact_usage_baseline();
        assert!(!should_trigger_compact(
            baseline.prompt_tokens,
            96_000,
            None
        ));
    }
}
