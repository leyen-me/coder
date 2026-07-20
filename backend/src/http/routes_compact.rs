//! HTTP route for manual compact trigger.
//!
//! POST /api/compact
//! Body: { session_id, task_id? }
//!
//! Running agent: queues via registry (resolved from session_id).
//! Otherwise: compacts immediately using session + provider settings.

use axum::{extract::State, response::Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::{
    agent::compact::{apply_compact, build_compact_snapshot, run_compact, CompactResult},
    agent::registry::resolve_api_key,
    db::session_store::{get_messages_by_session, get_session},
    scheduled_jobs::resolve_job_runtime,
    AppState,
};

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
    let session_id = payload.session_id.trim();
    if session_id.is_empty() {
        return Json(CompactTriggerResponse {
            ok: false,
            compacted: false,
            message: "session_id is required.".into(),
        });
    }

    // Mode 1: running agent — resolve task from session (or explicit task_id) and queue.
    let queued_task_id = {
        let mut registry = match state.agent_registry.lock() {
            Ok(registry) => registry,
            Err(_) => {
                return Json(CompactTriggerResponse {
                    ok: false,
                    compacted: false,
                    message: "Agent registry unavailable.".into(),
                });
            }
        };

        if let Some(task_id) = payload
            .task_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            if registry.request_compact(task_id) {
                Some(task_id.to_string())
            } else {
                None
            }
        } else {
            registry.request_compact_for_session(session_id)
        }
    };

    if let Some(task_id) = queued_task_id {
        return Json(CompactTriggerResponse {
            ok: true,
            compacted: true,
            message: format!("Compact queued for task={task_id}."),
        });
    }

    // Mode 2: direct compact — resolve credentials from session + provider settings.
    let session = {
        let db = match state.db.lock() {
            Ok(db) => db,
            Err(_) => {
                return Json(CompactTriggerResponse {
                    ok: false,
                    compacted: false,
                    message: "Database unavailable.".into(),
                });
            }
        };
        match get_session(&db, session_id) {
            Ok(Some(session)) => session,
            Ok(None) => {
                return Json(CompactTriggerResponse {
                    ok: false,
                    compacted: false,
                    message: format!("Session not found: {session_id}"),
                });
            }
            Err(error) => {
                return Json(CompactTriggerResponse {
                    ok: false,
                    compacted: false,
                    message: format!("Failed to read session: {error}"),
                });
            }
        }
    };

    let runtime = match resolve_job_runtime(&session.provider, &session.model, false) {
        Ok(runtime) => runtime,
        Err(error) => {
            return Json(CompactTriggerResponse {
                ok: false,
                compacted: false,
                message: format!("Failed to resolve provider settings: {error}"),
            });
        }
    };

    let api_key = match resolve_api_key(
        runtime.api_key_source.as_str(),
        runtime.api_key.as_deref(),
        runtime.api_key_env_var.as_str(),
    ) {
        Ok(api_key) => api_key,
        Err(error) => {
            return Json(CompactTriggerResponse {
                ok: false,
                compacted: false,
                message: error,
            });
        }
    };

    let base_url = runtime.base_url;
    let model = session.model;

    let (failed_read, raw_messages) = {
        let db = state.db.lock().map_err(|_| "db lock").unwrap();
        match get_messages_by_session(&db, session_id) {
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
    let snapshot = build_compact_snapshot(
        Vec::new(),
        session.workspace_dir.clone(),
        Vec::new(),
        Vec::new(),
        Vec::new(),
    );

    match run_compact(
        &client,
        &base_url,
        &api_key,
        &model,
        &messages,
        &snapshot,
        false,
    )
    .await
    {
        Ok(summary) => {
            let result: CompactResult = apply_compact(&messages, &summary);
            log::info!(
                "direct_compact session={} removed={} remaining={}",
                session_id,
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
