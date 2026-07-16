use axum::{
    extract::{Path, Query, State},
    response::sse::{Event, KeepAlive, Sse},
};
use futures::stream::Stream;
use serde::Deserialize;
use std::convert::Infallible;
use std::sync::Arc;
use tokio::sync::broadcast::error::RecvError;

use crate::AppState;

fn close_event_json(reason: &str, message: &str, skipped: Option<u64>) -> String {
    let mut payload = serde_json::json!({
        "type": "close",
        "reason": reason,
        "message": message,
    });
    if let Some(skipped) = skipped {
        payload["skipped"] = serde_json::Value::from(skipped);
    }
    payload.to_string()
}

/// SSE endpoint for agent events and other real-time streaming.
pub async fn handle_sse_events(
    Path(topic): Path<String>,
    Query(query): Query<SseReplayQuery>,
    State(state): State<Arc<AppState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.sse_broadcaster.subscribe(&topic);
    let replay_events = query
        .from_seq
        .and_then(|from_seq| {
            crate::agent::agent_replay_events(&state.agent_registry, topic.clone(), from_seq).ok()
        })
        .unwrap_or_default();

    let stream = async_stream::stream! {
        // Yield a heartbeat immediately so the proxy / client sees headers
        yield Ok(Event::default().data(r#"{"type":"heartbeat"}"#));

        for replay in replay_events {
            yield Ok(Event::default().data(replay));
        }

        let mut rx = rx;
        loop {
            match rx.recv().await {
                Ok(data) => {
                    yield Ok(Event::default().data(data));
                }
                Err(RecvError::Lagged(skipped)) => {
                    yield Ok(Event::default().data(close_event_json(
                        "lagged",
                        "Agent SSE subscriber lagged behind and the stream was closed.",
                        Some(skipped),
                    )));
                    break;
                }
                Err(RecvError::Closed) => {
                    yield Ok(Event::default().data(close_event_json(
                        "closed",
                        "Agent SSE channel closed.",
                        None,
                    )));
                    break;
                }
            }
        }
    };

    Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(std::time::Duration::from_secs(15))
            .text(r#"{"type":"heartbeat"}"#),
    )
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SseReplayQuery {
    pub from_seq: Option<u64>,
}

/// SSE endpoint for shell output streaming.
pub async fn handle_shell_sse(
    Path(shell_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    // Reuse shell-{shell_id} as the topic
    let topic = format!("shell-{}", shell_id);
    let rx = state.sse_broadcaster.subscribe(&topic);

    let stream = async_stream::stream! {
        let mut rx = rx;
        loop {
            match rx.recv().await {
                Ok(data) => {
                    yield Ok(Event::default().data(data));
                }
                Err(RecvError::Lagged(skipped)) => {
                    yield Ok(Event::default().data(close_event_json(
                        "lagged",
                        "Shell SSE subscriber lagged behind and the stream was closed.",
                        Some(skipped),
                    )));
                    break;
                }
                Err(RecvError::Closed) => {
                    yield Ok(Event::default().data(close_event_json(
                        "closed",
                        "Shell SSE channel closed.",
                        None,
                    )));
                    break;
                }
            }
        }
    };

    Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(std::time::Duration::from_secs(15))
            .text(r#"{"type":"heartbeat"}"#),
    )
}
