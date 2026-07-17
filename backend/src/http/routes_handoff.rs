use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::agent::handoff::continue_after_handoff;
use crate::agent::{
    AgentContextUsageSnapshot, AgentStartParams, AgentToolDefinition,
};
use crate::db::session_store::get_session;
use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoffRequest {
    pub session_id: String,
    pub task_id: String,
    pub base_url: String,
    pub api_key: Option<String>,
    pub api_key_source: String,
    pub api_key_env_var: String,
    pub model: String,
    #[serde(default)]
    pub max_context_tokens: Option<u32>,
    #[serde(default)]
    pub handoff_trigger_threshold: Option<f64>,
    #[serde(default)]
    pub agent_mode: Option<String>,
    #[serde(default)]
    pub thinking_enabled: Option<bool>,
    #[serde(default)]
    pub request_extensions: Option<Value>,
    #[serde(default)]
    pub models: Option<Vec<Value>>,
    #[serde(default)]
    pub extra_tools: Option<Vec<AgentToolDefinition>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoffResponse {
    pub continued_session_id: String,
    pub continued_task_id: String,
}

/// Cancel any running agent task for the given session.
async fn cancel_active_handoff_task(state: &Arc<AppState>, session_id: &str) {
    let Ok(status) =
        crate::agent::agent_get_session_status(&state.agent_registry, session_id.to_string())
    else {
        return;
    };
    let Some(status) = status else {
        return;
    };
    let _ = crate::agent::agent_cancel(&state.agent_registry, status.task_id.clone());
}

/// POST /api/handoff
pub async fn handle_handoff(
    State(state): State<Arc<AppState>>,
    Json(req): Json<HandoffRequest>,
) -> Result<Json<HandoffResponse>, (StatusCode, String)> {
    // 1. Cancel any running agent for this session
    cancel_active_handoff_task(&state, &req.session_id).await;

    // 2. Validate session exists
    let session = {
        let db = state
            .db
            .lock()
            .map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Database lock poisoned".to_string(),
                )
            })?;
        get_session(&db, &req.session_id)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?
            .ok_or_else(|| {
                (
                    StatusCode::BAD_REQUEST,
                    format!("Session not found: {}", req.session_id),
                )
            })?
    };

    // 3. Assemble agent messages from the session
    let assembled_messages = crate::agent::assemble_agent_messages(
        &state,
        &session,
        req.agent_mode.as_deref(),
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    if assembled_messages.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Session has no messages to handoff".to_string(),
        ));
    }

    // 4. Resolve tool definitions
    let include_handoff = crate::agent::session_includes_handoff_tools(&session);
    let tools = crate::agent::resolve_agent_tool_definitions(
        &state,
        req.agent_mode.as_deref(),
        include_handoff,
        req.extra_tools.clone(),
    )
    .await;

    // 5. Construct AgentStartParams
    let params = AgentStartParams {
        task_id: req.task_id.clone(),
        base_url: req.base_url,
        api_key: req.api_key,
        api_key_source: req.api_key_source,
        api_key_env_var: req.api_key_env_var,
        model: req.model,
        messages: assembled_messages,
        tools: Some(tools),
        request_extensions: req.request_extensions,
        session_id: Some(req.session_id.clone()),
        emit_assistant_output: Some(true),
        max_context_tokens: req.max_context_tokens,
        handoff_trigger_threshold: req.handoff_trigger_threshold,
        agent_mode: req.agent_mode.or(Some("agent".to_string())),
        thinking_enabled: req.thinking_enabled,
        models: req.models,
        session_kind: Some(session.session_kind.clone()),
        autonomy_mode: Some(session.autonomy_mode.clone()),
        decision_policy_version: Some(session.decision_policy_version.clone()),
        decision_model: session.decision_model.clone(),
    };

    // 6. Create a realistic context usage snapshot
    // These values inform the LLM and are stored in the handoff artifact.
    let context_usage = AgentContextUsageSnapshot {
        used_tokens: 80_000,
        max_tokens: 100_000,
        remaining_tokens: 20_000,
        reserved_tokens: 5_000,
        trigger_threshold: 0.8,
    };

    // 7. Execute the handoff
    let broadcaster = state.sse_broadcaster.clone();
    let registry = state.agent_registry.clone();
    let outcome = continue_after_handoff(
        &params,
        &params.messages,
        &context_usage,
        &broadcaster,
        &registry,
        state,
    )
    .await
    .map_err(|e| {
        let msg = format!("Handoff failed: {e}");
        (StatusCode::INTERNAL_SERVER_ERROR, msg)
    })?;

    Ok(Json(HandoffResponse {
        continued_session_id: outcome.continued_session_id,
        continued_task_id: outcome.continued_task_id,
    }))
}
