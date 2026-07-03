use axum::{
    extract::{Path, State},
    response::sse::{Event, KeepAlive, Sse},
};
use futures::stream::Stream;
use std::convert::Infallible;
use std::sync::Arc;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;

use crate::{AppState, AgentSseEvent};

/// SSE endpoint for agent events and other real-time streaming.
pub async fn handle_sse_events(
    Path(topic): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.sse_broadcaster.subscribe(&topic);

    let stream = async_stream::stream! {
        // Yield a heartbeat immediately so the proxy / client sees headers
        yield Ok(Event::default().data(r#"{"type":"heartbeat"}"#));

        let mut rx = rx;
        use tokio_stream::StreamExt;
        while let Ok(data) = rx.recv().await {
            yield Ok(Event::default().data(data));
        }
    };

    Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(std::time::Duration::from_secs(15))
            .text(r#"{"type":"heartbeat"}"#),
    )
}

/// SSE endpoint for shell output streaming.
pub async fn handle_shell_sse(
    Path(shell_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    // Reuse shell-{shell_id} as the topic
    let topic = format!("shell-{}", shell_id);
    let rx = state.sse_broadcaster.subscribe(&topic);

    let stream = BroadcastStream::new(rx).map(|result| match result {
        Ok(data) => Ok(Event::default().data(data)),
        Err(_) => Ok(Event::default().data(r#"{"type":"close"}"#)),
    });

    Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(std::time::Duration::from_secs(15))
            .text(r#"{"type":"heartbeat"}"#),
    )
}
