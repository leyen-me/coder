use std::time::Duration;

use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

use super::types::{AgentEvent, AgentStatus, ChatMessage};

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
}

#[derive(Debug, Default, Deserialize)]
struct StreamDelta {
    content: Option<String>,
    reasoning_content: Option<String>,
}

#[derive(Debug, Serialize)]
struct ChatCompletionRequest<'a> {
    model: &'a str,
    messages: &'a [ChatMessage],
    stream: bool,
}

pub async fn stream_chat_completion(
    client: &Client,
    url: String,
    api_key: &str,
    model: &str,
    messages: &[ChatMessage],
    cancel: CancellationToken,
    mut emit: impl FnMut(AgentEvent) + Send,
    task_id: &str,
) -> Result<(), String> {
    let request_body = ChatCompletionRequest {
        model,
        messages,
        stream: true,
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

            if process_sse_line(&line, task_id, &mut emit) {
                return Ok(());
            }
        }
    }

    if !line_buffer.trim().is_empty() {
        let remaining = line_buffer.trim().to_string();
        if process_sse_line(&remaining, task_id, &mut emit) {
            return Ok(());
        }
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
) -> bool {
    if line.is_empty() || line.starts_with(':') {
        return false;
    }

    let payload = line.strip_prefix("data:").map(str::trim).unwrap_or(line);
    if payload == "[DONE]" {
        emit(AgentEvent::Done {
            task_id: task_id.to_string(),
        });
        return true;
    }

    let parsed: StreamChunk = match serde_json::from_str(payload) {
        Ok(value) => value,
        Err(_) => return false,
    };

    let Some(choice) = parsed.choices.first() else {
        return false;
    };

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

    false
}

pub fn build_http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|error| format!("Failed to build HTTP client: {error}"))
}

#[cfg(test)]
mod tests {
    use super::process_sse_line;

    #[test]
    fn parses_content_delta_from_sse_line() {
        let mut events = Vec::new();
        let done = process_sse_line(
            r#"data: {"choices":[{"delta":{"content":"你好"}}]}"#,
            "task-1",
            &mut |event| events.push(format!("{event:?}")),
        );
        assert!(!done);
        assert_eq!(events.len(), 1);
        assert!(events[0].contains("ContentDelta"));
        assert!(events[0].contains("你好"));
    }
}
