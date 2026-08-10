use std::collections::BTreeMap;
use std::time::Duration;

use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::time::{timeout, Duration as TokioDuration};
use tokio_util::sync::CancellationToken;

use super::stream_log::{
    agent_diagnostic_log, agent_stream_log, format_error_chain, preview_for_log,
    sanitize_url_for_log,
};
use super::types::{AgentEvent, AgentStatus, AgentToolDefinition, ChatMessage, ToolCall};
use crate::tools::shell::Utf8StreamDecoder;

const NON_STREAM_REQUEST_TIMEOUT: Duration = Duration::from_secs(120);
/// Hard cap for an entire SSE stream (slow local models can run for many minutes).
const STREAM_TOTAL_TIMEOUT: Duration = Duration::from_secs(1800);
/// Fail only when the upstream stops sending chunks for this long.
const STREAM_IDLE_TIMEOUT: Duration = Duration::from_secs(120);

fn format_stream_read_error(error: Option<&reqwest::Error>, idle_timed_out: bool) -> String {
    if idle_timed_out {
        return format!(
            "Stream read timed out: no data received for {}s",
            STREAM_IDLE_TIMEOUT.as_secs()
        );
    }

    let Some(error) = error else {
        return "Stream read failed: unknown error".to_string();
    };

    if error.is_timeout() {
        return format!(
            "Stream read timed out: exceeded {}s total stream limit ({error})",
            STREAM_TOTAL_TIMEOUT.as_secs()
        );
    }

    format!("Stream read failed: {error}")
}

fn preview_text(value: &str, limit: usize) -> String {
    let mut chars = value.chars();
    let preview: String = chars.by_ref().take(limit).collect();
    if chars.next().is_some() {
        format!("{preview}...")
    } else {
        preview
    }
}

pub fn chat_completions_url(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.ends_with("/v1") {
        format!("{trimmed}/chat/completions")
    } else {
        format!("{trimmed}/v1/chat/completions")
    }
}

#[derive(Debug, Default, Deserialize)]
struct StreamUsage {
    #[serde(default)]
    prompt_tokens: u32,
    #[serde(default)]
    completion_tokens: u32,
    #[serde(default)]
    total_tokens: u32,
}

#[derive(Debug, Default, Deserialize)]
struct StreamTimings {
    #[serde(default)]
    prompt_n: u32,
    #[serde(default)]
    cache_n: u32,
    #[serde(default)]
    predicted_n: u32,
}

#[derive(Debug, Deserialize)]
struct StreamChunk {
    choices: Vec<StreamChoice>,
    #[serde(default)]
    usage: Option<StreamUsage>,
    #[serde(default)]
    timings: Option<StreamTimings>,
}

#[derive(Debug, Deserialize)]
struct StreamChoice {
    delta: Option<StreamDelta>,
    finish_reason: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct StreamDelta {
    content: Option<String>,
    reasoning_content: Option<String>,
    tool_calls: Option<Vec<StreamToolCallDelta>>,
}

#[derive(Debug, Default, Deserialize, Clone)]
struct StreamToolCallDelta {
    index: Option<usize>,
    id: Option<String>,
    function: Option<StreamToolFunctionDelta>,
}

#[derive(Debug, Default, Deserialize, Clone)]
struct StreamToolFunctionDelta {
    name: Option<String>,
    arguments: Option<String>,
}

#[derive(Debug, Serialize)]
struct ChatCompletionRequest<'a> {
    model: &'a str,
    messages: &'a [ChatMessage],
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<&'a [AgentToolDefinition]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<&'static str>,
}

/// Strips `image_url` content parts from messages before they reach the LLM.
///
/// History assembled while a multimodal model was active can carry
/// OpenAI-style `image_url` parts. If the user later switches to a text-only
/// model, those parts must be removed from the request body — publishing an
/// `image_url` block to a non-vision endpoint is a 400 deserialization error
/// (`unknown variant 'image_url', expected 'text'`).
///
/// The original stored history is left untouched; this only shapes what is
/// serialized for the current request. Content that is a plain string passes
/// through. A content array has its `image_url`-typed entries dropped; if that
/// leaves the array empty it is replaced with a short text note so the message
/// stays structurally valid.
pub fn strip_image_urls(messages: &[ChatMessage]) -> Vec<ChatMessage> {
    messages
        .iter()
        .map(|message| {
            let Some(content) = message.content.as_ref().and_then(Value::as_array) else {
                return message.clone();
            };
            let kept = content
                .iter()
                .filter(|part| part.get("type").and_then(Value::as_str) != Some("image_url"))
                .cloned()
                .collect::<Vec<_>>();
            if kept.len() == content.len() {
                return message.clone();
            }
            let mut stripped = message.clone();
            stripped.content = Some(Value::Array(if kept.is_empty() {
                vec![json!({
                    "type": "text",
                    "text": "[Image omitted: the current model does not support image input.]"
                })]
            } else {
                kept
            }));
            stripped
        })
        .collect()
}

pub const SESSION_TITLE_MAX_TOKENS: u32 = 128;
pub const REFINE_PROMPT_MAX_TOKENS: u32 = 2048;

#[derive(Debug, Deserialize)]
struct CompletionResponse {
    choices: Vec<CompletionChoice>,
}

#[derive(Debug, Deserialize)]
struct CompletionChoice {
    message: Option<CompletionMessage>,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CompletionMessage {
    content: Option<String>,
}

struct ToolCallAccumulator {
    calls: BTreeMap<usize, PartialToolCall>,
    announced_ids: std::collections::HashSet<String>,
}

#[derive(Default)]
struct PartialToolCall {
    id: Option<String>,
    name: Option<String>,
    arguments: String,
}

impl ToolCallAccumulator {
    fn ingest(
        &mut self,
        delta: StreamToolCallDelta,
        task_id: &str,
        emit: &mut impl FnMut(AgentEvent),
    ) {
        let index = delta.index.unwrap_or(0);
        let entry = self.calls.entry(index).or_default();

        if let Some(id) = delta.id {
            entry.id = Some(id);
        }

        if let Some(function) = delta.function {
            if let Some(name) = function.name {
                entry.name = Some(name);
            }
            if let Some(arguments) = function.arguments {
                entry.arguments.push_str(&arguments);
            }
        }

        if let (Some(id), Some(name)) = (&entry.id, &entry.name) {
            if self.announced_ids.insert(id.clone()) {
                emit(AgentEvent::ToolCallPending {
                    task_id: task_id.to_string(),
                    tool_call_id: id.clone(),
                    name: name.clone(),
                });
            }
        }
    }

    fn finalize(self) -> Vec<ToolCall> {
        self.calls
            .into_values()
            .filter_map(|call| {
                Some(ToolCall {
                    id: call.id?,
                    name: call.name?,
                    arguments: call.arguments,
                })
            })
            .collect()
    }
}

pub const SESSION_TITLE_SYSTEM_PROMPT: &str = r#"You write short chat session titles for a sidebar history list.
Output ONLY the title text (no quotes, no markdown). Same language as the user. At most ~20 Chinese characters or 12 English words."#;

pub async fn stream_chat_completion(
    client: &Client,
    url: String,
    api_key: &str,
    model: &str,
    messages: &[ChatMessage],
    tools: Option<&[AgentToolDefinition]>,
    request_extensions: Option<&Value>,
    cancel: CancellationToken,
    mut emit: impl FnMut(AgentEvent) + Send,
    task_id: &str,
    supports_multimodal: bool,
) -> Result<(), String> {
    agent_stream_log(format!(
        "start task_id={} model={} messages={} tools={} request_extensions={}",
        task_id,
        model,
        messages.len(),
        tools.map(|value| value.len()).unwrap_or(0),
        request_extensions.is_some()
    ));
    agent_diagnostic_log(format!(
        "stream_start task_id={task_id} model={model} url={} messages={} tools={} request_extensions={}",
        sanitize_url_for_log(&url),
        messages.len(),
        tools.map(|value| value.len()).unwrap_or(0),
        request_extensions.is_some()
    ));

    // When the active model is text-only, drop any leftover `image_url`
    // content parts so a non-vision endpoint never receives an `image_url`
    // block. The original shared slice is kept when multimodal is supported,
    // otherwise we borrow a freshly filtered clone for the request body.
    let filtered_messages;
    let effective_messages: &[ChatMessage] = if supports_multimodal {
        messages
    } else {
        filtered_messages = strip_image_urls(messages);
        &filtered_messages
    };

    let request_body = ChatCompletionRequest {
        model,
        messages: effective_messages,
        stream: true,
        max_tokens: None,
        temperature: None,
        tools,
        tool_choice: tools.map(|_| "auto"),
    };

    let mut request_json = serde_json::to_value(&request_body)
        .map_err(|error| format!("Failed to encode request: {error}"))?;

    if let Some(extensions) = request_extensions {
        if let (Some(base), Some(extra)) = (request_json.as_object_mut(), extensions.as_object()) {
            for (key, value) in extra {
                base.insert(key.clone(), value.clone());
            }
        }
    }

    let response = tokio::select! {
        biased;
        () = cancel.cancelled() => {
            emit(AgentEvent::Status {
                task_id: task_id.to_string(),
                status: AgentStatus::Cancelled,
            });
            return Ok(());
        }
        response = client
            .post(&url)
            .bearer_auth(api_key)
            .header("Accept", "text/event-stream")
            .json(&request_json)
            .timeout(STREAM_TOTAL_TIMEOUT)
            .send() => response,
    }
    .map_err(|error| {
            let message = if error.is_timeout() {
                format!(
                    "Request failed: stream exceeded {}s total limit ({error})",
                    STREAM_TOTAL_TIMEOUT.as_secs()
                )
            } else {
                format!("Request failed: {error}")
            };
            agent_diagnostic_log(format!(
                "request_failed task_id={task_id} model={model} url={} error={error} error_chain={}",
                sanitize_url_for_log(&url),
                format_error_chain(&error)
            ));
            message
        })?;

    let status = response.status();
    let content_type = header_value_for_log(response.headers().get("content-type"));
    let content_encoding = header_value_for_log(response.headers().get("content-encoding"));
    let transfer_encoding = header_value_for_log(response.headers().get("transfer-encoding"));

    if !status.is_success() {
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "<unable to read body>".to_string());
        agent_diagnostic_log(format!(
            "api_error task_id={task_id} model={model} url={} status={status} content_type={content_type} content_encoding={content_encoding} transfer_encoding={transfer_encoding} body_preview={:?}",
            sanitize_url_for_log(&url),
            preview_for_log(&body, 800)
        ));
        return Err(format!("API error ({status}): {body}"));
    }

    agent_diagnostic_log(format!(
        "stream_response task_id={task_id} model={model} url={} status={status} content_type={content_type} content_encoding={content_encoding} transfer_encoding={transfer_encoding}",
        sanitize_url_for_log(&url)
    ));

    let mut stream = response.bytes_stream();
    let mut line_buffer = String::new();
    let mut byte_decoder = Utf8StreamDecoder::default();
    let mut bytes_received: usize = 0;
    let mut chunk_count: usize = 0;
    let mut tool_calls = ToolCallAccumulator {
        calls: BTreeMap::new(),
        announced_ids: std::collections::HashSet::new(),
    };
    let mut finish_reason: Option<String> = None;
    let mut stream_usage: Option<StreamUsage> = None;

    loop {
        let poll_result = tokio::select! {
            biased;
            () = cancel.cancelled() => {
                agent_stream_log(format!(
                    "cancelled task_id={} while reading stream",
                    task_id
                ));
                emit(AgentEvent::Status {
                    task_id: task_id.to_string(),
                    status: AgentStatus::Cancelled,
                });
                return Ok(());
            }
            result = timeout(
                TokioDuration::from(STREAM_IDLE_TIMEOUT),
                stream.next(),
            ) => match result {
                Ok(Some(chunk_result)) => chunk_result,
                Ok(None) => break,
                Err(_) => {
                    let message = format_stream_read_error(None, true);
                    agent_diagnostic_log(format!(
                        "stream_read_failed task_id={task_id} model={model} url={} bytes_received={bytes_received} chunk_count={chunk_count} line_buffer_len={} line_buffer_preview={:?} finish_reason={finish_reason:?} tool_call_count={} idle_timed_out=true idle_timeout_secs={}",
                        sanitize_url_for_log(&url),
                        line_buffer.len(),
                        preview_for_log(&line_buffer, 800),
                        tool_calls.calls.len(),
                        STREAM_IDLE_TIMEOUT.as_secs()
                    ));
                    return Err(message);
                }
            },
        };

        let chunk = match poll_result {
            Ok(bytes) => bytes,
            Err(error) => {
                let message = format_stream_read_error(Some(&error), false);
                agent_diagnostic_log(format!(
                    "stream_read_failed task_id={task_id} model={model} url={} bytes_received={bytes_received} chunk_count={chunk_count} line_buffer_len={} line_buffer_preview={:?} finish_reason={finish_reason:?} tool_call_count={} idle_timed_out=false error={error} error_chain={} is_timeout={} is_connect={} is_decode={} is_request={}",
                    sanitize_url_for_log(&url),
                    line_buffer.len(),
                    preview_for_log(&line_buffer, 800),
                    tool_calls.calls.len(),
                    format_error_chain(&error),
                    error.is_timeout(),
                    error.is_connect(),
                    error.is_decode(),
                    error.is_request()
                ));
                return Err(message);
            }
        };
        bytes_received += chunk.len();
        chunk_count += 1;
        line_buffer.push_str(&byte_decoder.push(&chunk));

        while let Some(newline_index) = line_buffer.find('\n') {
            let line = line_buffer[..newline_index].trim().to_string();
            line_buffer.drain(..=newline_index);

            if process_sse_line(
                &line,
                task_id,
                &mut emit,
                &mut tool_calls,
                &mut finish_reason,
                &mut stream_usage,
            ) {
                return finalize_stream(task_id, tool_calls, finish_reason, stream_usage, emit);
            }
        }
    }

    line_buffer.push_str(&byte_decoder.finish());

    if !line_buffer.trim().is_empty() {
        let remaining = line_buffer.trim().to_string();
        if process_sse_line(
            &remaining,
            task_id,
            &mut emit,
            &mut tool_calls,
            &mut finish_reason,
            &mut stream_usage,
        ) {
            return finalize_stream(task_id, tool_calls, finish_reason, stream_usage, emit);
        }
        agent_diagnostic_log(format!(
            "stream_ended_with_buffer task_id={task_id} model={model} url={} bytes_received={bytes_received} chunk_count={chunk_count} line_buffer_len={} line_buffer_preview={:?} finish_reason={finish_reason:?}",
            sanitize_url_for_log(&url),
            line_buffer.len(),
            preview_for_log(&line_buffer, 800)
        ));
    } else {
        agent_diagnostic_log(format!(
            "stream_ended task_id={task_id} model={model} url={} bytes_received={bytes_received} chunk_count={chunk_count} finish_reason={finish_reason:?}",
            sanitize_url_for_log(&url)
        ));
    }

    finalize_stream(task_id, tool_calls, finish_reason, stream_usage, emit)
}

fn header_value_for_log(value: Option<&reqwest::header::HeaderValue>) -> String {
    value
        .and_then(|header| header.to_str().ok())
        .unwrap_or("<missing>")
        .to_string()
}

fn finalize_stream(
    task_id: &str,
    tool_calls: ToolCallAccumulator,
    finish_reason: Option<String>,
    stream_usage: Option<StreamUsage>,
    mut emit: impl FnMut(AgentEvent),
) -> Result<(), String> {
    let resolved_tool_calls = tool_calls.finalize();
    agent_stream_log(format!(
        "finalize task_id={} finish_reason={:?} tool_calls={} usage={}",
        task_id,
        finish_reason,
        resolved_tool_calls.len(),
        stream_usage.is_some()
    ));
    if finish_reason.as_deref() == Some("tool_calls") || !resolved_tool_calls.is_empty() {
        emit(AgentEvent::TurnComplete {
            task_id: task_id.to_string(),
            tool_calls: resolved_tool_calls,
        });
    }

    let usage = stream_usage.map(|s| super::types::TokenUsage {
        prompt_tokens: s.prompt_tokens,
        completion_tokens: s.completion_tokens,
        total_tokens: s.total_tokens,
    });
    emit(AgentEvent::Done {
        task_id: task_id.to_string(),
        usage,
    });
    Ok(())
}

/// Returns true when the stream is finished ([DONE]).
fn process_sse_line(
    line: &str,
    task_id: &str,
    emit: &mut impl FnMut(AgentEvent),
    tool_calls: &mut ToolCallAccumulator,
    finish_reason: &mut Option<String>,
    stream_usage: &mut Option<StreamUsage>,
) -> bool {
    if line.is_empty() || line.starts_with(':') {
        return false;
    }

    let payload = line.strip_prefix("data:").map(str::trim).unwrap_or(line);
    if payload == "[DONE]" {
        agent_stream_log(format!("done task_id={} received [DONE]", task_id));
        return true;
    }

    let parsed: StreamChunk = match serde_json::from_str(payload) {
        Ok(value) => value,
        Err(_) => return false,
    };

    // Capture usage from the final chunk (choices may be empty when usage is present).
    if let Some(usage) = parsed.usage {
        stream_usage.get_or_insert(usage);
    }

    // Fallback: derive usage from timings when usage is missing (e.g. llama.cpp streaming).
    if stream_usage.is_none() {
        if let Some(t) = &parsed.timings {
            let prompt_tokens = t.prompt_n.saturating_add(t.cache_n);
            let completion_tokens = t.predicted_n;
            stream_usage.get_or_insert(StreamUsage {
                prompt_tokens,
                completion_tokens,
                total_tokens: prompt_tokens.saturating_add(completion_tokens),
            });
        }
    }

    let Some(choice) = parsed.choices.first() else {
        return false;
    };

    if let Some(next_finish_reason) = &choice.finish_reason {
        *finish_reason = Some(next_finish_reason.clone());
    }

    let Some(delta) = &choice.delta else {
        return false;
    };

    if let Some(reasoning) = &delta.reasoning_content {
        if !reasoning.is_empty() {
            agent_stream_log(format!(
                "delta task_id={} kind=reasoning len={} preview={:?}",
                task_id,
                reasoning.len(),
                preview_text(reasoning, 120)
            ));
            emit(AgentEvent::ThinkingDelta {
                task_id: task_id.to_string(),
                delta: reasoning.clone(),
            });
        }
    }

    if let Some(content) = &delta.content {
        if !content.is_empty() {
            agent_stream_log(format!(
                "delta task_id={} kind=content len={} preview={:?}",
                task_id,
                content.len(),
                preview_text(content, 120)
            ));
            emit(AgentEvent::ContentDelta {
                task_id: task_id.to_string(),
                delta: content.clone(),
            });
        }
    }

    if let Some(next_tool_calls) = &delta.tool_calls {
        agent_stream_log(format!(
            "delta task_id={} kind=tool_calls count={}",
            task_id,
            next_tool_calls.len()
        ));
        for tool_call in next_tool_calls {
            tool_calls.ingest(
                StreamToolCallDelta {
                    index: tool_call.index,
                    id: tool_call.id.clone(),
                    function: tool_call.function.clone(),
                },
                task_id,
                emit,
            );
        }
    }

    false
}

pub async fn complete_chat_completion(
    client: &Client,
    url: String,
    api_key: &str,
    model: &str,
    messages: &[ChatMessage],
    max_tokens: u32,
    supports_multimodal: bool,
) -> Result<Option<String>, String> {
    let filtered_messages;
    let effective_messages: &[ChatMessage] = if supports_multimodal {
        messages
    } else {
        filtered_messages = strip_image_urls(messages);
        &filtered_messages
    };

    let request_body = ChatCompletionRequest {
        model,
        messages: effective_messages,
        stream: false,
        max_tokens: Some(max_tokens),
        temperature: Some(0.3),
        tools: None,
        tool_choice: None,
    };

    let response = client
        .post(&url)
        .bearer_auth(api_key)
        .json(&request_body)
        .timeout(NON_STREAM_REQUEST_TIMEOUT)
        .send()
        .await
        .map_err(|error| format!("Request failed: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "<unable to read body>".to_string());
        return Err(format!("API error ({status}): {body}"));
    }

    let parsed: CompletionResponse = response
        .json()
        .await
        .map_err(|error| format!("Failed to parse response: {error}"))?;

    if parsed
        .choices
        .first()
        .and_then(|choice| choice.finish_reason.as_deref())
        == Some("length")
    {
        return Err(
            "Completion stopped because max_tokens was reached; summary may be truncated"
                .to_string(),
        );
    }

    Ok(parsed
        .choices
        .first()
        .and_then(|choice| choice.message.as_ref())
        .and_then(|message| message.content.as_ref())
        .map(|content| content.trim().to_string())
        .filter(|content| !content.is_empty()))
}

pub fn build_http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(NON_STREAM_REQUEST_TIMEOUT)
        .build()
        .map_err(|error| format!("Failed to build HTTP client: {error}"))
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use serde_json::json;

    use super::{process_sse_line, strip_image_urls, ToolCallAccumulator, ChatMessage};

    #[test]
    fn strip_image_urls_removes_image_parts_but_keeps_text() {
        let message = ChatMessage {
            role: "user".to_string(),
            content: Some(json!([
                { "type": "text", "text": "hello" },
                { "type": "image_url", "image_url": { "url": "data:image/png;base64,AAA", "detail": "auto" } }
            ])),
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: None,
            name: None,
        };
        let stripped = strip_image_urls(&[message]);
        assert_eq!(stripped.len(), 1);
        let parts = stripped[0].content.as_ref().and_then(serde_json::Value::as_array).unwrap();
        assert_eq!(parts.len(), 1);
        assert_eq!(parts[0]["type"], "text");
        assert_eq!(parts[0]["text"], "hello");
    }

    #[test]
    fn strip_image_urls_leaves_string_content_unmodified() {
        let message = ChatMessage {
            role: "user".to_string(),
            content: Some(json!("plain text only")),
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: None,
            name: None,
        };
        let stripped = strip_image_urls(&[message]);
        assert_eq!(stripped[0].content, Some(json!("plain text only")));
    }

    #[test]
    fn strip_image_urls_fills_empty_array_with_text_placeholder() {
        let message = ChatMessage {
            role: "tool".to_string(),
            content: Some(json!([
                { "type": "image_url", "image_url": { "url": "data:image/png;base64,BBB", "detail": "auto" } }
            ])),
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: Some("call_1".to_string()),
            name: Some("read_image".to_string()),
        };
        let stripped = strip_image_urls(&[message]);
        let parts = stripped[0].content.as_ref().and_then(serde_json::Value::as_array).unwrap();
        assert_eq!(parts.len(), 1);
        assert_eq!(parts[0]["type"], "text");
        assert!(parts[0]["text"].as_str().unwrap().contains("Image omitted"));
    }

    #[test]
    fn parses_content_delta_from_sse_line() {
        let mut events = Vec::new();
        let mut tool_calls = ToolCallAccumulator {
            calls: BTreeMap::new(),
            announced_ids: std::collections::HashSet::new(),
        };
        let mut finish_reason = None;
        let mut stream_usage = None;
        let done = process_sse_line(
            r#"data: {"choices":[{"delta":{"content":"你好"}}]}"#,
            "task-1",
            &mut |event| events.push(format!("{event:?}")),
            &mut tool_calls,
            &mut finish_reason,
            &mut stream_usage,
        );
        assert!(!done);
        assert_eq!(events.len(), 1);
        assert!(events[0].contains("ContentDelta"));
        assert!(events[0].contains("你好"));
        assert!(stream_usage.is_none());
    }

    #[test]
    fn utf8_stream_decoder_preserves_multibyte_across_sse_chunks() {
        use crate::tools::shell::Utf8StreamDecoder;

        let payload = r#"data: {"choices":[{"delta":{"content":"你好"}}]}"#;
        let bytes = payload.as_bytes();
        let mut decoder = Utf8StreamDecoder::default();
        let mut line_buffer = String::new();

        for chunk in bytes.chunks(4) {
            line_buffer.push_str(&decoder.push(chunk));
        }
        line_buffer.push_str(&decoder.finish());

        assert!(line_buffer.contains("你好"));
        assert!(!line_buffer.contains('\u{FFFD}'));
    }

    #[test]
    fn captures_usage_from_streaming_chunk() {
        let mut events = Vec::new();
        let mut tool_calls = ToolCallAccumulator {
            calls: BTreeMap::new(),
            announced_ids: std::collections::HashSet::new(),
        };
        let mut finish_reason = None;
        let mut stream_usage = None;
        let done = process_sse_line(
            r#"data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}"#,
            "task-1",
            &mut |event| events.push(format!("{event:?}")),
            &mut tool_calls,
            &mut finish_reason,
            &mut stream_usage,
        );
        assert!(!done);
        assert!(events.is_empty());
        let usage = stream_usage.expect("should capture usage");
        assert_eq!(usage.prompt_tokens, 10);
        assert_eq!(usage.completion_tokens, 20);
        assert_eq!(usage.total_tokens, 30);
    }

    #[test]
    fn derives_usage_from_timings_fallback() {
        let mut events = Vec::new();
        let mut tool_calls = ToolCallAccumulator {
            calls: BTreeMap::new(),
            announced_ids: std::collections::HashSet::new(),
        };
        let mut finish_reason = None;
        let mut stream_usage = None;
        let done = process_sse_line(
            r#"data: {"choices":[{"finish_reason":"stop","index":0,"delta":{}}],"timings":{"prompt_n":4,"cache_n":9,"predicted_n":5}}"#,
            "task-1",
            &mut |event| events.push(format!("{event:?}")),
            &mut tool_calls,
            &mut finish_reason,
            &mut stream_usage,
        );
        assert!(!done);
        let usage = stream_usage.expect("should derive usage from timings");
        assert_eq!(usage.prompt_tokens, 13); // 4 + 9
        assert_eq!(usage.completion_tokens, 5);
        assert_eq!(usage.total_tokens, 18);
    }

    #[test]
    fn usage_takes_priority_over_timings() {
        let mut events = Vec::new();
        let mut tool_calls = ToolCallAccumulator {
            calls: BTreeMap::new(),
            announced_ids: std::collections::HashSet::new(),
        };
        let mut finish_reason = None;
        let mut stream_usage = None;
        let done = process_sse_line(
            r#"data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":100,"completion_tokens":200,"total_tokens":300},"timings":{"prompt_n":4,"cache_n":9,"predicted_n":5}}"#,
            "task-1",
            &mut |event| events.push(format!("{event:?}")),
            &mut tool_calls,
            &mut finish_reason,
            &mut stream_usage,
        );
        assert!(!done);
        let usage = stream_usage.expect("should capture usage");
        // usage takes priority over timings
        assert_eq!(usage.prompt_tokens, 100);
        assert_eq!(usage.completion_tokens, 200);
        assert_eq!(usage.total_tokens, 300);
    }
}
