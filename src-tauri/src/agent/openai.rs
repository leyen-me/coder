use std::collections::BTreeMap;
use std::time::Duration;

use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

use super::types::{AgentEvent, AgentStatus, AgentToolDefinition, ChatMessage, ToolCall};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

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
}

#[derive(Default)]
struct PartialToolCall {
    id: Option<String>,
    name: Option<String>,
    arguments: String,
}

impl ToolCallAccumulator {
    fn ingest(&mut self, delta: StreamToolCallDelta) {
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
    cancel: CancellationToken,
    mut emit: impl FnMut(AgentEvent) + Send,
    task_id: &str,
) -> Result<(), String> {
    let request_body = ChatCompletionRequest {
        model,
        messages,
        stream: true,
        max_tokens: None,
        temperature: None,
        tools,
        tool_choice: tools.map(|_| "auto"),
    };

    let response = client
        .post(&url)
        .bearer_auth(api_key)
        .header("Accept", "text/event-stream")
        .json(&request_body)
        .timeout(REQUEST_TIMEOUT)
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

    let mut stream = response.bytes_stream();
    let mut line_buffer = String::new();
    let mut tool_calls = ToolCallAccumulator {
        calls: BTreeMap::new(),
    };
    let mut finish_reason: Option<String> = None;

    while let Some(chunk_result) = stream.next().await {
        if cancel.is_cancelled() {
            emit(AgentEvent::Status {
                task_id: task_id.to_string(),
                status: AgentStatus::Cancelled,
            });
            return Ok(());
        }

        let chunk = chunk_result.map_err(|error| format!("Stream read failed: {error}"))?;
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
    }

    finalize_stream(task_id, tool_calls, finish_reason, emit)
}

fn finalize_stream(
    task_id: &str,
    tool_calls: ToolCallAccumulator,
    finish_reason: Option<String>,
    mut emit: impl FnMut(AgentEvent),
) -> Result<(), String> {
    let resolved_tool_calls = tool_calls.finalize();
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
            emit(AgentEvent::ThinkingDelta {
                task_id: task_id.to_string(),
                delta: reasoning.clone(),
            });
        }
    }

    if let Some(content) = &delta.content {
        if !content.is_empty() {
            emit(AgentEvent::ContentDelta {
                task_id: task_id.to_string(),
                delta: content.clone(),
            });
        }
    }

    if let Some(next_tool_calls) = &delta.tool_calls {
        for tool_call in next_tool_calls {
            tool_calls.ingest(StreamToolCallDelta {
                index: tool_call.index,
                id: tool_call.id.clone(),
                function: tool_call.function.clone(),
            });
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
        .timeout(REQUEST_TIMEOUT)
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
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|error| format!("Failed to build HTTP client: {error}"))
}

#[cfg(test)]
mod tests {
    use super::{process_sse_line, ToolCallAccumulator};

    #[test]
    fn parses_content_delta_from_sse_line() {
        let mut events = Vec::new();
        let mut tool_calls = ToolCallAccumulator {
            calls: BTreeMap::new(),
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
