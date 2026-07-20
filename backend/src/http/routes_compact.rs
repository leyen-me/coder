//! HTTP route for manual compact trigger.
//!
//! POST /api/compact
//! Body: { session_id, task_id?, force? }
//!
//! Running agent: queues via registry (resolved from session_id).
//! Otherwise: compacts immediately using session + provider settings.

use axum::{extract::State, response::Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::{
    agent::compact::{
        allow_force_compact, build_compact_snapshot, persist_compact_summary,
        run_compact, CompactPersistOptions,
    },
    agent::registry::resolve_api_key,
    db::{
        records::MESSAGE_KIND_COMPACT,
        session_store::{
            estimate_compact_anchor_after_message_id, get_messages_by_session, get_session,
            truncate_history_at_latest_compact,
        },
    },
    scheduled_jobs::resolve_job_runtime,
    AppState,
};

#[derive(Debug, Deserialize)]
pub struct CompactTriggerRequest {
    #[serde(alias = "sessionId")]
    pub session_id: String,
    #[serde(default, alias = "taskId")]
    pub task_id: Option<String>,
    #[serde(default)]
    pub force: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompactTriggerResponse {
    pub ok: bool,
    pub compacted: bool,
    pub code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub removed_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remaining_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anchor_after_message_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_kept_message_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compact_message_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary_preview: Option<String>,
}

fn conversation_message_count(messages: &[crate::db::records::MessageRecord]) -> usize {
    messages
        .iter()
        .filter(|message| message.message_kind.as_deref() != Some(MESSAGE_KIND_COMPACT))
        .count()
}

fn queued_response(anchor_after_message_id: Option<String>) -> CompactTriggerResponse {
    CompactTriggerResponse {
        ok: true,
        compacted: true,
        code: "queued".to_string(),
        removed_count: None,
        remaining_count: None,
        anchor_after_message_id,
        first_kept_message_id: None,
        compact_message_id: None,
        summary_preview: None,
    }
}

fn error_response(code: &str) -> CompactTriggerResponse {
    CompactTriggerResponse {
        ok: false,
        compacted: false,
        code: code.to_string(),
        removed_count: None,
        remaining_count: None,
        anchor_after_message_id: None,
        first_kept_message_id: None,
        compact_message_id: None,
        summary_preview: None,
    }
}

pub async fn handle_compact(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CompactTriggerRequest>,
) -> Json<CompactTriggerResponse> {
    let session_id = payload.session_id.trim();
    if session_id.is_empty() {
        return Json(error_response("invalid_session"));
    }

    let raw_messages = {
        let db = match state.db.lock() {
            Ok(db) => db,
            Err(_) => return Json(error_response("database_unavailable")),
        };
        match get_messages_by_session(&db, session_id) {
            Ok(msgs) => msgs,
            Err(_) => return Json(error_response("messages_unavailable")),
        }
    };

    let anchor_after_message_id = estimate_compact_anchor_after_message_id(&raw_messages);

    let force = payload.force && allow_force_compact();

    // Mode 1: running agent — resolve task from session (or explicit task_id) and queue.
    let queued_task_id = {
        let mut registry = match state.agent_registry.lock() {
            Ok(registry) => registry,
            Err(_) => return Json(error_response("registry_unavailable")),
        };

        if let Some(task_id) = payload
            .task_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            if registry.request_compact(task_id, force) {
                Some(task_id.to_string())
            } else {
                None
            }
        } else {
            registry.request_compact_for_session(session_id, force)
        }
    };

    if queued_task_id.is_some() {
        return Json(queued_response(anchor_after_message_id));
    }

    // Mode 2: direct compact — resolve credentials from session + provider settings.
    let session = {
        let db = match state.db.lock() {
            Ok(db) => db,
            Err(_) => return Json(error_response("database_unavailable")),
        };
        match get_session(&db, session_id) {
            Ok(Some(session)) => session,
            Ok(None) => return Json(error_response("session_not_found")),
            Err(_) => return Json(error_response("session_unavailable")),
        }
    };

    let runtime = match resolve_job_runtime(&session.provider, &session.model, false) {
        Ok(runtime) => runtime,
        Err(_) => return Json(error_response("provider_unavailable")),
    };

    let api_key = match resolve_api_key(
        runtime.api_key_source.as_str(),
        runtime.api_key.as_deref(),
        runtime.api_key_env_var.as_str(),
    ) {
        Ok(api_key) => api_key,
        Err(_) => return Json(error_response("api_key_unavailable")),
    };

    if conversation_message_count(&raw_messages) < 2 {
        return Json(CompactTriggerResponse {
            ok: true,
            compacted: false,
            code: "not_enough_messages".to_string(),
            removed_count: None,
            remaining_count: None,
            anchor_after_message_id,
            first_kept_message_id: None,
            compact_message_id: None,
            summary_preview: None,
        });
    }

    // Summarize the current model-visible window (after the latest compact),
    // not the entire retained chat history.
    let model_window = truncate_history_at_latest_compact(raw_messages.clone());
    let messages: Vec<crate::agent::ChatMessage> = model_window
        .iter()
        .filter(|message| message.message_kind.as_deref() != Some(MESSAGE_KIND_COMPACT))
        .map(|m| {
            let content = if m.content.is_empty() {
                None
            } else {
                Some(serde_json::Value::String(m.content.clone()))
            };
            crate::agent::ChatMessage {
                role: m.role.clone(),
                content,
                reasoning_content: None,
                tool_calls: None,
                tool_call_id: None,
                name: None,
            }
        })
        .collect();

    let client = match crate::agent::openai::build_http_client() {
        Ok(client) => client,
        Err(_) => return Json(error_response("http_client_unavailable")),
    };
    let snapshot = build_compact_snapshot(
        Vec::new(),
        session.workspace_dir.clone(),
        Vec::new(),
        Vec::new(),
        Vec::new(),
    );

    match run_compact(
        &client,
        &runtime.base_url,
        &api_key,
        &session.model,
        &messages,
        &snapshot,
        false,
    )
    .await
    {
        Ok(summary) => {
            let summary_preview = summary.text.chars().take(200).collect::<String>();
            match persist_compact_summary(
                &state.db,
                Some(session_id),
                &summary,
                CompactPersistOptions::for_manual(force),
            ) {
                Ok(result) if result.removed_count > 0 => {
                    let conversation_count = conversation_message_count(&raw_messages);
                    let remaining = conversation_count.saturating_sub(result.removed_count);
                    log::info!(
                        "direct_compact session={} removed={} remaining={}",
                        session_id,
                        result.removed_count,
                        remaining
                    );
                    Json(CompactTriggerResponse {
                        ok: true,
                        compacted: true,
                        code: "compacted".to_string(),
                        removed_count: Some(result.removed_count as u32),
                        remaining_count: Some(remaining as u32),
                        anchor_after_message_id: result.anchor_after_message_id,
                        first_kept_message_id: result.first_kept_message_id,
                        compact_message_id: Some(result.compact_message_id),
                        summary_preview: Some(summary_preview),
                    })
                }
                Ok(_) => Json(CompactTriggerResponse {
                    ok: true,
                    compacted: false,
                    code: "noop_already_fits".to_string(),
                    removed_count: Some(0),
                    remaining_count: Some(conversation_message_count(&raw_messages) as u32),
                    anchor_after_message_id,
                    first_kept_message_id: None,
                    compact_message_id: None,
                    summary_preview: None,
                }),
                Err(_) => Json(error_response("persist_failed")),
            }
        }
        Err(_) => Json(error_response("compact_failed")),
    }
}
