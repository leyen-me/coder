//! HTTP route for manual compact trigger.
//!
//! POST /api/compact
//! Body: { session_id, task_id?, force? }
//!
//! Agent 运行中时排队给 loop 执行；空闲时直接执行。

use axum::{extract::State, response::Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::{
    agent::compact::{persist_compact_summary, run_compact},
    agent::registry::resolve_api_key,
    db::records::MESSAGE_KIND_COMPACT,
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

fn error_response(code: &str) -> CompactTriggerResponse {
    CompactTriggerResponse {
        ok: false,
        compacted: false,
        code: code.to_string(),
        removed_count: None,
        remaining_count: None,
        anchor_after_message_id: None,
        compact_message_id: None,
        summary_preview: None,
    }
}

fn last_conversation_message_id(
    messages: &[crate::db::records::MessageRecord],
) -> Option<String> {
    messages
        .iter()
        .rev()
        .find(|message| message.message_kind.as_deref() != Some(MESSAGE_KIND_COMPACT))
        .map(|message| message.id.clone())
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

    let anchor_after_message_id = last_conversation_message_id(&raw_messages);

    // Agent 运行中时，把手动压缩请求交给 loop，下一轮立即执行；
    // 空闲时直接在本路由执行。
    let agent_running = {
        let mut registry = match state.agent_registry.lock() {
            Ok(registry) => registry,
            Err(_) => return Json(error_response("registry_unavailable")),
        };
        match registry.request_compact_for_session(session_id, false) {
            Some(_) => {
                return Json(CompactTriggerResponse {
                    ok: true,
                    compacted: false,
                    code: "queued".to_string(),
                    removed_count: None,
                    remaining_count: None,
                    anchor_after_message_id,
                    compact_message_id: None,
                    summary_preview: None,
                })
            }
            None => registry.get_session_status(session_id).is_some(),
        }
    };

    if agent_running {
        return Json(error_response("agent_running"));
    }

    // Direct compact — resolve credentials from session + provider settings.
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
            compact_message_id: None,
            summary_preview: None,
        });
    }

    // 使用与 agent 完全一致的模型上下文，保留消息结构、工具调用和完整内容。
    let messages = match crate::agent::assemble_agent_messages(&state, &session) {
        Ok(messages) => messages,
        Err(_) => return Json(error_response("messages_unavailable")),
    };

    let client = match crate::agent::openai::build_http_client() {
        Ok(client) => client,
        Err(_) => return Json(error_response("http_client_unavailable")),
    };

    match run_compact(&client, &runtime.base_url, &api_key, &session.model, &messages).await {
        Ok(summary) => {
            let summary_preview = summary.text.clone();
            match persist_compact_summary(&state.db, Some(session_id), &summary) {
                Ok(result) => {
                    log::info!(
                        "direct_compact session={} compact_message_id={} removed={}",
                        session_id,
                        result.compact_message_id,
                        result.removed_count
                    );
                    Json(CompactTriggerResponse {
                        ok: true,
                        compacted: true,
                        code: "compacted".to_string(),
                        removed_count: Some(result.removed_count as u32),
                        remaining_count: Some(0),
                        anchor_after_message_id: result.anchor_after_message_id,
                        compact_message_id: Some(result.compact_message_id),
                        summary_preview: Some(summary_preview),
                    })
                }
                Err(_) => Json(error_response("persist_failed")),
            }
        }
        Err(_) => Json(error_response("compact_failed")),
    }
}
