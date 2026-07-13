use std::sync::Arc;
use std::time::Duration;

use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE};
use reqwest::{Client, StatusCode};
use serde_json::Value;
use tokio::time::timeout;

use super::oauth::McpOAuthStore;
use super::protocol::{
    build_jsonrpc_notification, build_jsonrpc_request, find_jsonrpc_response, format_mcp_error,
    format_json_error, initialize_params, parse_content_blocks, parse_sse_messages,
    MCP_PROTOCOL_VERSION,
};
use super::types::{McpContentBlock, McpServerConfig, McpToolDefinition};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);
const INIT_TIMEOUT: Duration = Duration::from_secs(30);

pub struct HttpMcpClient {
    http: Client,
    endpoint: String,
    session_id: Option<String>,
    next_id: u64,
    oauth_store: Arc<McpOAuthStore>,
    server_id: String,
    custom_headers: Vec<(String, String)>,
}

impl HttpMcpClient {
    pub async fn connect(
        config: &McpServerConfig,
        oauth_store: Arc<McpOAuthStore>,
    ) -> Result<Self, String> {
        let endpoint = config.url.trim().to_string();
        if endpoint.is_empty() {
            return Err("MCP server URL is required for remote transport".to_string());
        }

        let custom_headers: Vec<(String, String)> = config
            .headers
            .iter()
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect();

        let http = Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

        let mut client = Self {
            http,
            endpoint,
            session_id: None,
            next_id: 0,
            oauth_store,
            server_id: config.id.clone(),
            custom_headers,
        };

        client.initialize().await?;
        Ok(client)
    }

    async fn initialize(&mut self) -> Result<(), String> {
        let response = timeout(
            INIT_TIMEOUT,
            self.post_message(build_jsonrpc_request(1, "initialize", Some(initialize_params()))),
        )
        .await
        .map_err(|_| "MCP initialize timed out".to_string())??;

        if response.get("error").is_some() {
            return Err(format_mcp_error("initialize", &response));
        }

        self.notify("notifications/initialized", None).await?;
        Ok(())
    }

    pub async fn list_tools(&mut self) -> Result<Vec<McpToolDefinition>, String> {
        let mut tools = Vec::new();
        let mut cursor: Option<String> = None;

        loop {
            let params = match &cursor {
                Some(c) => serde_json::json!({ "cursor": c }),
                None => serde_json::json!({}),
            };

            let response = timeout(REQUEST_TIMEOUT, self.request("tools/list", Some(params)))
                .await
                .map_err(|_| "MCP tools/list timed out".to_string())??;

            if let Some(error) = response.get("error") {
                return Err(format_json_error("tools/list", error));
            }

            let result = response
                .get("result")
                .ok_or_else(|| "MCP tools/list response missing result".to_string())?;

            if let Some(batch) = result.get("tools").and_then(|v| v.as_array()) {
                for tool in batch {
                    let parsed: McpToolDefinition = serde_json::from_value(tool.clone())
                        .map_err(|e| format!("Invalid MCP tool definition: {e}"))?;
                    tools.push(parsed);
                }
            }

            cursor = result
                .get("nextCursor")
                .and_then(|v| v.as_str())
                .map(str::to_string);

            if cursor.is_none() {
                break;
            }
        }

        Ok(tools)
    }

    pub async fn call_tool(
        &mut self,
        name: &str,
        arguments: Value,
    ) -> Result<(Vec<McpContentBlock>, bool), String> {
        let params = serde_json::json!({
            "name": name,
            "arguments": arguments,
        });

        let response = timeout(REQUEST_TIMEOUT, self.request("tools/call", Some(params)))
            .await
            .map_err(|_| format!("MCP tools/call timed out for tool '{name}'"))??;

        if let Some(error) = response.get("error") {
            return Err(format_json_error("tools/call", error));
        }

        let result = response
            .get("result")
            .ok_or_else(|| "MCP tools/call response missing result".to_string())?;

        let is_error = result
            .get("isError")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let content = parse_content_blocks(result.get("content"))?;
        Ok((content, is_error))
    }

    async fn request(&mut self, method: &str, params: Option<Value>) -> Result<Value, String> {
        self.next_id += 1;
        let id = self.next_id;
        let payload = build_jsonrpc_request(id, method, params);
        self.post_message(payload).await
    }

    async fn notify(&mut self, method: &str, params: Option<Value>) -> Result<(), String> {
        let payload = build_jsonrpc_notification(method, params);
        let _ = self.send_post(payload, false).await?;
        Ok(())
    }

    async fn post_message(&mut self, payload: Value) -> Result<Value, String> {
        let id = payload
            .get("id")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| "MCP request missing id".to_string())?;
        let response = self.send_post(payload, true).await?;
        response
            .get("id")
            .and_then(|v| v.as_u64())
            .filter(|response_id| *response_id == id)
            .ok_or_else(|| "MCP response id mismatch".to_string())?;
        Ok(response)
    }

    async fn send_post(&mut self, payload: Value, expect_response: bool) -> Result<Value, String> {
        let access_token = self
            .oauth_store
            .get_valid_access_token(&self.server_id)
            .await?;

        let mut request = self
            .http
            .post(&self.endpoint)
            .header(ACCEPT, "application/json, text/event-stream")
            .header(CONTENT_TYPE, "application/json")
            .header("MCP-Protocol-Version", MCP_PROTOCOL_VERSION)
            .json(&payload);

        if let Some(session_id) = &self.session_id {
            request = request.header("Mcp-Session-Id", session_id);
        }

        if let Some(token) = &access_token {
            request = request.header(AUTHORIZATION, format!("Bearer {token}"));
        }

        for (key, value) in &self.custom_headers {
            request = request.header(key.as_str(), value.as_str());
        }

        let response = request
            .send()
            .await
            .map_err(|e| format!("MCP HTTP request failed: {e}"))?;

        if response.status() == StatusCode::UNAUTHORIZED {
            return Err(
                "MCP authentication required. Please authorize this server in Settings.".to_string(),
            );
        }

        if let Some(session_id) = response.headers().get("mcp-session-id") {
            if let Ok(value) = session_id.to_str() {
                self.session_id = Some(value.to_string());
            }
        }

        let status = response.status();
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .to_string();
        let body = response
            .text()
            .await
            .map_err(|e| format!("Failed to read MCP HTTP response: {e}"))?;

        if status == StatusCode::ACCEPTED {
            if expect_response {
                return Err("MCP server accepted notification but no response was returned".to_string());
            }
            return Ok(serde_json::json!({}));
        }

        if !status.is_success() {
            return Err(format!(
                "MCP HTTP request failed with status {status}: {body}"
            ));
        }

        if content_type.contains("text/event-stream") {
            let messages = parse_sse_messages(&body);
            let id = payload.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
            return find_jsonrpc_response(&messages, id).ok_or_else(|| {
                format!("MCP SSE response missing JSON-RPC result (body: {body})")
            });
        }

        let message: Value = serde_json::from_str(body.trim())
            .map_err(|e| format!("Invalid JSON from MCP server: {e} (body: {body})"))?;
        Ok(message)
    }
}
