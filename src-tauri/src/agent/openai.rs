use std::collections::BTreeMap;
use std::time::Duration;

use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::time::{timeout, Duration as TokioDuration};
use tokio_util::sync::CancellationToken;

use super::stream_log::{
    agent_diagnostic_log, agent_stream_log, format_error_chain, preview_for_log,
    sanitize_url_for_log,
};
use super::types::{AgentEvent, AgentStatus, AgentToolDefinition, ChatMessage, ToolCall};

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

#[derive(Debug, Deserialize)]
struct StreamChunk {
    choices: Vec<StreamChoice>,
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

const SESSION_TITLE_MAX_TOKENS: u32 = 128;

#[derive(Debug, Deserialize)]
struct CompletionResponse {
    choices: Vec<CompletionChoice>,
}

#[derive(Debug, Deserialize)]
struct CompletionChoice {
    message: Option<CompletionMessage>,
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

    let request_body = ChatCompletionRequest {
        model,
        messages,
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

    let response = client
        .post(&url)
        .bearer_auth(api_key)
        .header("Accept", "text/event-stream")
        .json(&request_json)
        .timeout(STREAM_TOTAL_TIMEOUT)
        .send()
        .await
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
    let mut bytes_received: usize = 0;
    let mut chunk_count: usize = 0;
    let mut tool_calls = ToolCallAccumulator {
        calls: BTreeMap::new(),
        announced_ids: std::collections::HashSet::new(),
    };
    let mut finish_reason: Option<String> = None;

    loop {
        if cancel.is_cancelled() {
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

        let chunk_result = match timeout(
            TokioDuration::from(STREAM_IDLE_TIMEOUT),
            stream.next(),
        )
        .await
        {
            Ok(Some(result)) => result,
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
        };

        let chunk = match chunk_result {
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
        line_buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(newline_index) = line_buffer.find('\n') {
            let line = line_buffer[..newline_index].trim().to_string();
            line_buffer.drain(..=newline_index);

            if process_sse_line(
                &line,
                task_id,
                &mut emit,
                &mut tool_calls,
                &mut finish_reason,
            ) {
                return finalize_stream(task_id, tool_calls, finish_reason, emit);
            }
        }
    }

    if !line_buffer.trim().is_empty() {
        let remaining = line_buffer.trim().to_string();
        if process_sse_line(
            &remaining,
            task_id,
            &mut emit,
            &mut tool_calls,
            &mut finish_reason,
        ) {
            return finalize_stream(task_id, tool_calls, finish_reason, emit);
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

    finalize_stream(task_id, tool_calls, finish_reason, emit)
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
    mut emit: impl FnMut(AgentEvent),
) -> Result<(), String> {
    let resolved_tool_calls = tool_calls.finalize();
    agent_stream_log(format!(
        "finalize task_id={} finish_reason={:?} tool_calls={}",
        task_id,
        finish_reason,
        resolved_tool_calls.len()
    ));
    if finish_reason.as_deref() == Some("tool_calls") || !resolved_tool_calls.is_empty() {
        emit(AgentEvent::TurnComplete {
            task_id: task_id.to_string(),
            tool_calls: resolved_tool_calls,
        });
    }

    emit(AgentEvent::Done {
        task_id: task_id.to_string(),
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
) -> Result<Option<String>, String> {
    let request_body = ChatCompletionRequest {
        model,
        messages,
        stream: false,
        max_tokens: Some(SESSION_TITLE_MAX_TOKENS),
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

    use super::{process_sse_line, ToolCallAccumulator};

    #[test]
    fn parses_content_delta_from_sse_line() {
        let mut events = Vec::new();
        let mut tool_calls = ToolCallAccumulator {
            calls: BTreeMap::new(),
            announced_ids: std::collections::HashSet::new(),
        };
        let mut finish_reason = None;
        let done = process_sse_line(
            r#"data: {"choices":[{"delta":{"content":"你好"}}]}"#,
            "task-1",
            &mut |event| events.push(format!("{event:?}")),
            &mut tool_calls,
            &mut finish_reason,
        );
        assert!(!done);
        assert_eq!(events.len(), 1);
        assert!(events[0].contains("ContentDelta"));
        assert!(events[0].contains("你好"));
    }
}
