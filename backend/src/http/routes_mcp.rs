use axum::{extract::State, http::StatusCode, Json};
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
