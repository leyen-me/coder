use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{Html, IntoResponse},
    Json,
};
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;

use crate::tools::McpServerConfig;
use crate::AppState;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerRequest {
    pub config: McpServerConfig,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpCallToolParams {
    pub config: McpServerConfig,
    pub tool_name: String,
    #[serde(default)]
    pub arguments: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpDisconnectParams {
    pub server_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpOAuthStartParams {
    pub config: McpServerConfig,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpOAuthStatusParams {
    pub server_id: String,
}

#[derive(Deserialize)]
pub struct McpOAuthCallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

fn oauth_redirect_uri(state: &AppState) -> String {
    format!("{}/api/mcp/oauth/callback", state.http_base_url.trim_end_matches('/'))
}

/// POST /api/mcp/list_tools
pub async fn handle_mcp_list_tools(
    State(state): State<Arc<AppState>>,
    Json(params): Json<McpServerRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let result = state
        .mcp_registry
        .list_tools(params.config)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/mcp/call_tool
pub async fn handle_mcp_call_tool(
    State(state): State<Arc<AppState>>,
    Json(params): Json<McpCallToolParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let result = state
        .mcp_registry
        .call_tool(params.config, params.tool_name, params.arguments)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/mcp/test_connection
pub async fn handle_mcp_test_connection(
    State(state): State<Arc<AppState>>,
    Json(params): Json<McpServerRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let result = state
        .mcp_registry
        .test_connection(params.config)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/mcp/disconnect
pub async fn handle_mcp_disconnect(
    State(state): State<Arc<AppState>>,
    Json(params): Json<McpDisconnectParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    state.mcp_registry.disconnect(&params.server_id);
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// POST /api/mcp/oauth/start
pub async fn handle_mcp_oauth_start(
    State(state): State<Arc<AppState>>,
    Json(params): Json<McpOAuthStartParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let redirect_uri = oauth_redirect_uri(&state);
    let result = state
        .mcp_registry
        .start_oauth(params.config, redirect_uri)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    if let Err(error) = open::that(&result.authorize_url) {
        log::warn!("Failed to open browser for MCP OAuth: {error}");
    }

    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// GET /api/mcp/oauth/callback
pub async fn handle_mcp_oauth_callback(
    State(state): State<Arc<AppState>>,
    Query(query): Query<McpOAuthCallbackQuery>,
) -> impl IntoResponse {
    if let Some(error) = query.error {
        let description = query.error_description.unwrap_or_default();
        return Html(format!(
            "<html><body><h2>MCP authorization failed</h2><p>{error}</p><p>{description}</p><p>You can close this window.</p></body></html>"
        ));
    }

    let (code, oauth_state) = match (query.code, query.state) {
        (Some(code), Some(state)) if !code.is_empty() && !state.is_empty() => (code, state),
        _ => {
            return Html(
                "<html><body><h2>MCP authorization failed</h2><p>Missing authorization code.</p></body></html>"
                    .to_string(),
            );
        }
    };

    let redirect_uri = oauth_redirect_uri(&state);
    match state
        .mcp_registry
        .complete_oauth(&oauth_state, &code, &redirect_uri)
        .await
    {
        Ok(server_id) => Html(format!(
            "<html><body><h2>MCP authorization successful</h2><p>Server <code>{server_id}</code> is now connected.</p><p>You can close this window and return to Coder.</p></body></html>"
        )),
        Err(error) => Html(format!(
            "<html><body><h2>MCP authorization failed</h2><p>{error}</p><p>You can close this window and try again from Coder Settings.</p></body></html>"
        )),
    }
}

/// POST /api/mcp/oauth/status
pub async fn handle_mcp_oauth_status(
    State(state): State<Arc<AppState>>,
    Json(params): Json<McpOAuthStatusParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let result = state.mcp_registry.oauth_status(&params.server_id);
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/mcp/oauth/revoke
pub async fn handle_mcp_oauth_revoke(
    State(state): State<Arc<AppState>>,
    Json(params): Json<McpOAuthStatusParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    state.mcp_registry.revoke_oauth(&params.server_id);
    Ok(Json(serde_json::json!({ "ok": true })))
}
