use serde_json::{json, Value};

use super::types::McpContentBlock;

pub const MCP_PROTOCOL_VERSION: &str = "2024-11-05";
pub const CLIENT_NAME: &str = "coder";
pub const CLIENT_VERSION: &str = "0.1.0";

pub fn initialize_params() -> Value {
    json!({
        "protocolVersion": MCP_PROTOCOL_VERSION,
        "capabilities": {},
        "clientInfo": {
            "name": CLIENT_NAME,
            "version": CLIENT_VERSION,
        }
    })
}

pub fn build_jsonrpc_request(id: u64, method: &str, params: Option<Value>) -> Value {
    let mut payload = json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
    });
    if let Some(params) = params {
        payload["params"] = params;
    }
    payload
}

pub fn build_jsonrpc_notification(method: &str, params: Option<Value>) -> Value {
    let mut payload = json!({
        "jsonrpc": "2.0",
        "method": method,
    });
    if let Some(params) = params {
        payload["params"] = params;
    }
    payload
}

pub fn parse_content_blocks(value: Option<&Value>) -> Result<Vec<McpContentBlock>, String> {
    let Some(array) = value.and_then(|v| v.as_array()) else {
        return Ok(Vec::new());
    };

    let mut blocks = Vec::with_capacity(array.len());
    for item in array {
        let block: McpContentBlock = serde_json::from_value(item.clone())
            .map_err(|e| format!("Invalid MCP content block: {e}"))?;
        blocks.push(block);
    }
    Ok(blocks)
}

pub fn format_mcp_error(method: &str, response: &Value) -> String {
    response
        .get("error")
        .map(|error| format_json_error(method, error))
        .unwrap_or_else(|| format!("MCP {method} failed"))
}

pub fn format_json_error(method: &str, error: &Value) -> String {
    let message = error
        .get("message")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown error");
    let code = error.get("code").map(|v| v.to_string()).unwrap_or_default();
    if code.is_empty() {
        format!("MCP {method} failed: {message}")
    } else {
        format!("MCP {method} failed [{code}]: {message}")
    }
}

pub fn parse_sse_messages(body: &str) -> Vec<Value> {
    let mut messages = Vec::new();
    let mut data_lines: Vec<String> = Vec::new();

    for line in body.lines() {
        if let Some(rest) = line.strip_prefix("data:") {
            data_lines.push(rest.trim().to_string());
            continue;
        }

        if line.trim().is_empty() && !data_lines.is_empty() {
            if let Some(message) = join_sse_data(&data_lines) {
                messages.push(message);
            }
            data_lines.clear();
        }
    }

    if !data_lines.is_empty() {
        if let Some(message) = join_sse_data(&data_lines) {
            messages.push(message);
        }
    }

    messages
}

fn join_sse_data(lines: &[String]) -> Option<Value> {
    let joined = lines.join("\n");
    serde_json::from_str(&joined).ok()
}

pub fn find_jsonrpc_response(messages: &[Value], id: u64) -> Option<Value> {
    messages
        .iter()
        .find(|message| message.get("id").and_then(|v| v.as_u64()) == Some(id))
        .cloned()
}
