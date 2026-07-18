use serde_json::{json, Value};

use super::types::{AgentContextUsageSnapshot, ChatMessage};

const DEFAULT_MODEL_CONTEXT_WINDOW: u32 = 32_000;
const DEFAULT_AGENT_HANDOFF_THRESHOLD: f64 = 0.85;
const HANDOFF_RESERVE_RATIO: f64 = 0.25;
const MIN_HANDOFF_RESERVE_TOKENS: u32 = 1_000;
const MAX_HANDOFF_RESERVE_TOKENS: u32 = 24_000;
const COMPACTED_TOOL_RESULT_KEEP_COUNT: usize = 4;
const COMPACTED_TOOL_RESULT_MAX_CHARS: usize = 4_000;
const IMAGE_TOKEN_ESTIMATE: u32 = 765;

pub fn compact_tool_result_messages(messages: &[ChatMessage]) -> Vec<ChatMessage> {
    let mut remaining_full_results = COMPACTED_TOOL_RESULT_KEEP_COUNT;
    let mut changed = false;
    let mut next_messages = messages.to_vec();

    for index in (0..messages.len()).rev() {
        let message = &messages[index];
        if message.role != "tool" {
            continue;
        }
        let Some(content) = message.content.as_ref().and_then(Value::as_str) else {
            continue;
        };

        if remaining_full_results > 0 {
            remaining_full_results -= 1;
            continue;
        }

        if content.len() <= COMPACTED_TOOL_RESULT_MAX_CHARS {
            continue;
        }

        let compacted = summarize_tool_result_content(message.name.as_deref(), content);
        if compacted == content {
            continue;
        }

        next_messages[index].content = Some(Value::String(compacted));
        changed = true;
    }

    if changed {
        next_messages
    } else {
        messages.to_vec()
    }
}

pub fn should_trigger_handoff(
    messages: &[ChatMessage],
    max_tokens: Option<u32>,
    trigger_threshold: Option<f64>,
    reported_prompt_tokens: Option<u32>,
) -> Option<AgentContextUsageSnapshot> {
    if !has_replayable_work(messages) {
        return None;
    }

    let usage = estimate_agent_context_usage(messages, max_tokens, trigger_threshold, reported_prompt_tokens);
    let threshold_tokens = (usage.max_tokens as f64 * usage.trigger_threshold).floor() as u32;

    if usage.used_tokens < threshold_tokens && usage.remaining_tokens > usage.reserved_tokens {
        return None;
    }

    Some(usage)
}

pub fn estimate_agent_context_usage(
    messages: &[ChatMessage],
    max_tokens: Option<u32>,
    trigger_threshold: Option<f64>,
    reported_prompt_tokens: Option<u32>,
) -> AgentContextUsageSnapshot {
    let max_tokens = normalize_positive_integer(max_tokens, DEFAULT_MODEL_CONTEXT_WINDOW);
    let trigger_threshold = normalize_threshold(trigger_threshold, DEFAULT_AGENT_HANDOFF_THRESHOLD);

    // Use the provider-reported prompt tokens as the authoritative input
    // token count when available. This is the exact input size from the
    // last API call — far more accurate than any heuristic estimation.
    let input_tokens = match reported_prompt_tokens {
        Some(reported) if reported > 0 => reported,
        _ => {
            // Fallback: character-based estimation over all messages.
            // Imperfect, but sufficient for the initial turn before any
            // API response is available.
            messages.iter().map(estimate_agent_message_tokens).sum::<u32>()
        }
    };

    let remaining_tokens = max_tokens.saturating_sub(input_tokens);
    let reserved_tokens = clamp(
        std::cmp::max(
            (max_tokens as f64 * (1.0 - trigger_threshold)).floor() as u32,
            (max_tokens as f64 * HANDOFF_RESERVE_RATIO).floor() as u32,
        ),
        MIN_HANDOFF_RESERVE_TOKENS,
        std::cmp::min(MAX_HANDOFF_RESERVE_TOKENS, max_tokens),
    );

    AgentContextUsageSnapshot {
        used_tokens: input_tokens,
        max_tokens,
        remaining_tokens,
        reserved_tokens,
        trigger_threshold,
    }
}

fn estimate_agent_message_tokens(message: &ChatMessage) -> u32 {
    let mut total = 0;

    match message.content.as_ref() {
        Some(Value::String(text)) => {
            total += estimate_text_tokens(text);
        }
        Some(Value::Array(parts)) => {
            for part in parts {
                let part_type = part.get("type").and_then(Value::as_str).unwrap_or_default();
                if part_type == "text" {
                    if let Some(text) = part.get("text").and_then(Value::as_str) {
                        total += estimate_text_tokens(text);
                    }
                } else if part_type == "image_url" {
                    total += IMAGE_TOKEN_ESTIMATE;
                }
            }
        }
        _ => {}
    }

    if let Some(reasoning) = message.reasoning_content.as_deref() {
        total += estimate_text_tokens(reasoning);
    }

    for tool_call in message.tool_calls.as_deref().unwrap_or(&[]) {
        total += estimate_text_tokens(&tool_call.function.name);
        total += estimate_text_tokens(&tool_call.function.arguments);
    }

    if let Some(tool_call_id) = message.tool_call_id.as_deref() {
        total += estimate_text_tokens(tool_call_id);
    }

    if let Some(name) = message.name.as_deref() {
        total += estimate_text_tokens(name);
    }

    total
}

fn has_replayable_work(messages: &[ChatMessage]) -> bool {
    messages.iter().any(|message| {
        if message.role == "tool" {
            return true;
        }
        if message.role != "assistant" {
            return false;
        }
        if message.tool_calls.as_ref().is_some_and(|calls| !calls.is_empty()) {
            return true;
        }
        if message
            .content
            .as_ref()
            .and_then(Value::as_str)
            .is_some_and(|content| !content.trim().is_empty())
        {
            return true;
        }
        message
            .reasoning_content
            .as_deref()
            .is_some_and(|reasoning| !reasoning.trim().is_empty())
    })
}

fn normalize_positive_integer(value: Option<u32>, fallback: u32) -> u32 {
    value.filter(|value| *value > 0).unwrap_or(fallback)
}

fn normalize_threshold(value: Option<f64>, fallback: f64) -> f64 {
    let value = value.unwrap_or(fallback);
    if value.is_finite() && (0.0..1.0).contains(&value) {
        value
    } else {
        fallback
    }
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

fn clamp(value: u32, min_value: u32, max_value: u32) -> u32 {
    value.max(min_value).min(max_value)
}

fn summarize_tool_result_content(tool_name: Option<&str>, content: &str) -> String {
    let tool_name = tool_name.unwrap_or("tool");
    let fallback = json!({
        "ok": true,
        "tool": tool_name,
        "data": {
            "compacted": true,
            "summary": format!("Older {tool_name} output was compacted to reduce prompt size."),
            "originalLength": content.len(),
        }
    })
    .to_string();

    let Ok(parsed) = serde_json::from_str::<Value>(content) else {
        return fallback;
    };
    let Some(data) = parsed.get("data").and_then(Value::as_object) else {
        return fallback;
    };

    let mut summary = serde_json::Map::new();
    summary.insert("compacted".to_string(), Value::Bool(true));
    summary.insert("tool".to_string(), Value::String(tool_name.to_string()));
    summary.insert(
        "originalLength".to_string(),
        Value::from(u64::try_from(content.len()).unwrap_or(u64::MAX)),
    );
    copy_summary_field(&mut summary, "path", data.get("path"));
    copy_summary_field(&mut summary, "targetDirectory", data.get("targetDirectory"));
    copy_summary_field(&mut summary, "pattern", data.get("pattern"));
    copy_summary_field(&mut summary, "command", data.get("command"));
    copy_summary_field(&mut summary, "query", data.get("query"));
    copy_summary_field(&mut summary, "status", data.get("status"));
    copy_summary_field(&mut summary, "mimeType", data.get("mimeType"));
    copy_summary_field(&mut summary, "truncated", data.get("truncated"));
    copy_summary_field(&mut summary, "totalLines", data.get("totalLines"));
    copy_summary_field(&mut summary, "startLine", data.get("startLine"));
    copy_summary_field(&mut summary, "endLine", data.get("endLine"));
    copy_summary_field(&mut summary, "totalMatches", data.get("totalMatches"));
    copy_summary_field(&mut summary, "total", data.get("total"));
    copy_summary_field(&mut summary, "exitCode", data.get("exitCode"));

    if let Some(preview) = extract_string_preview(data.get("content")) {
        summary.insert("contentPreview".to_string(), Value::String(preview));
    }
    if let Some(preview) = extract_string_preview(data.get("treeText")) {
        summary.insert("treePreview".to_string(), Value::String(preview));
    }

    json!({
        "ok": parsed.get("ok").and_then(Value::as_bool).unwrap_or(true),
        "tool": parsed.get("tool").and_then(Value::as_str).unwrap_or(tool_name),
        "data": Value::Object(summary),
    })
    .to_string()
}

fn copy_summary_field(
    target: &mut serde_json::Map<String, Value>,
    key: &str,
    value: Option<&Value>,
) {
    let Some(value) = value else {
        return;
    };
    if value.is_null() {
        return;
    }
    target.insert(key.to_string(), value.clone());
}

fn extract_string_preview(value: Option<&Value>) -> Option<String> {
    let text = value.and_then(Value::as_str)?.trim();
    if text.is_empty() {
        return None;
    }
    let preview = if text.chars().count() > 300 {
        let mut value = text.chars().take(300).collect::<String>();
        value.push_str("...");
        value
    } else {
        text.to_string()
    };
    Some(preview)
}
