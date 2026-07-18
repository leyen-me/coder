//! HTTP route for manual compact trigger.
//!
//! POST /api/compact
//! Body: { task_id: "..." }
//!
//! Sets a flag in AgentRegistry. The agent loop picks it up on the
//! next cycle and triggers an immediate context compaction regardless
//! of token budget.

use axum::{extract::State, response::Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct CompactTriggerRequest {
    pub task_id: String,
}

#[derive(Debug, Serialize)]
pub struct CompactTriggerResponse {
    pub ok: bool,
    pub found: bool,
    pub message: String,
}

pub async fn handle_compact(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CompactTriggerRequest>,
) -> Json<CompactTriggerResponse> {
    let found = match state.agent_registry.lock() {
        Ok(mut registry) => registry.request_compact(&payload.task_id),
        Err(_) => false,
    };

    Json(CompactTriggerResponse {
        ok: true,
        found,
        message: if found {
            format!(
                "Compact requested for task={}. Agent will compact on next cycle.",
                payload.task_id
            )
        } else {
            format!("Task {} not found in registry.", payload.task_id)
        },
    })
}
