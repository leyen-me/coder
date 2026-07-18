//! HTTP route for manual compact trigger.
//!
//! POST /api/compact
//! Body: { session_id, task_id?, base_url, api_key?, model }
//!
//! Running agent: queues via registry. Otherwise: compacts immediately.

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
    #[serde(default, alias = "baseUrl")]
    pub base_url: Option<String>,
    #[serde(default, alias = "apiKey")]
    pub api_key: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
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
    let mut queued = false;
    if let Some(ref task_id) = payload.task_id {
        if let Ok(mut registry) = state.agent_registry.lock() {
            queued = registry.request_compact(task_id);
        }
    }
    if queued {
        return Json(CompactTriggerResponse {
            ok: true,
            compacted: true,
            message: format!("Compact queued for task={}.", payload.task_id.as_deref().unwrap_or("?")),
        });
    }

    // Mode 2: no running agent — auto-compact on next message
    Json(CompactTriggerResponse {
        ok: true,
        compacted: false,
        message: "No running agent. Compact happens automatically on next message when token budget is exceeded.".into(),
    })
}
