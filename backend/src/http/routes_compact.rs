//! HTTP route for manual compact trigger.
//!
//! POST /api/compact
//! Body: { session_id, task_id?, base_url, api_key?, model }
//!
//! Running agent: queues via registry. Otherwise: compacts immediately.

use axum::{extract::State, response::Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::{
    agent::compact::{apply_compact, build_compact_snapshot, run_compact, CompactResult},
    db::session_store::get_messages_by_session,
    AppState,
};

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

    // Mode 2: direct compact — read messages, call LLM, write back
    let (base_url, api_key, model) = match (
        payload.base_url.as_deref(),
        payload.api_key.as_deref(),
        payload.model.as_deref(),
    ) {
        (Some(b), Some(k), Some(m)) if !b.is_empty() && !k.is_empty() && !m.is_empty() => {
            (b.to_string(), k.to_string(), m.to_string())
        }
        _ => {
            return Json(CompactTriggerResponse {
                ok: true,
                compacted: false,
                message: "No API credentials provided for direct compact.".into(),
            });
        }
    };

    let (failed_read, raw_messages) = {
        let db = state.db.lock().map_err(|_| "db lock").unwrap();
        match get_messages_by_session(&db, &payload.session_id) {
            Ok(msgs) => (false, msgs),
            Err(_) => (true, Vec::new()),
        }
    };

    if failed_read {
        return Json(CompactTriggerResponse {
            ok: false,
            compacted: false,
            message: "Failed to read session messages.".into(),
        });
    }

    let messages: Vec<crate::agent::ChatMessage> = raw_messages
        .into_iter()
        .map(|m| {
            let content = if m.content.is_empty() {
                None
            } else {
                Some(serde_json::Value::String(m.content))
            };
            crate::agent::ChatMessage {
                role: m.role,
                content,
                reasoning_content: None,
                tool_calls: None,
                tool_call_id: None,
                name: None,
            }
        })
        .collect();

    if messages.len() < 4 {
        return Json(CompactTriggerResponse {
            ok: true,
            compacted: false,
            message: "Not enough messages to compact.".into(),
        });
    }

    let client = crate::agent::openai::build_http_client().unwrap();
    let snapshot = build_compact_snapshot(Vec::new(), None, Vec::new(), Vec::new(), Vec::new());

    match run_compact(&client, &base_url, &api_key, &model, &messages, &snapshot, false).await {
        Ok(summary) => {
            let result: CompactResult = apply_compact(&messages, &summary);
            log::info!(
                "direct_compact session={} removed={} remaining={}",
                payload.session_id,
                result.removed_count,
                result.messages.len()
            );
            Json(CompactTriggerResponse {
                ok: true,
                compacted: true,
                message: format!(
                    "Compacted: removed {} messages, {} remaining.",
                    result.removed_count,
                    result.messages.len()
                ),
            })
        }
        Err(e) => Json(CompactTriggerResponse {
            ok: false,
            compacted: false,
            message: format!("Compact failed: {e}"),
        }),
    }
}
