//! HTTP route for manual compact trigger.
//!
//! POST /api/compact
//! Body: { session_id: "...", task_id?: "..." }
//!
//! Two modes:
//! 1. Running agent: sets a flag in AgentRegistry, loop picks it up.
//! 2. No running agent: compact will happen naturally on next user message
//!    via auto-compact threshold check.

use axum::{extract::State, response::Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct CompactTriggerRequest {
    #[serde(alias = "sessionId")]
    pub session_id: String,
    #[serde(default, alias = "taskId")]
    pub task_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CompactTriggerResponse {
    pub ok: bool,
    pub compacted: bool,
    pub message: String,
}

pub async fn handle_compact(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CompactTriggerRequest>,
) -> Json<CompactTriggerResponse> {
    // Mode 1: running agent — signal via registry
    if let Some(ref task_id) = payload.task_id {
        if let Ok(mut registry) = state.agent_registry.lock() {
            if registry.request_compact(task_id) {
                return Json(CompactTriggerResponse {
                    ok: true,
                    compacted: true,
                    message: format!("Compact queued for task={task_id}."),
                });
            }
        }
    }

    // Mode 2: no running agent — compact happens on next message
    Json(CompactTriggerResponse {
        ok: true,
        compacted: false,
        message: format!(
            "No running agent for session={}. Compact will happen automatically on next message.",
            payload.session_id
        ),
    })
}
