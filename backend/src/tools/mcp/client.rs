use std::time::Duration;

use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::time::timeout;

use super::types::{McpContentBlock, McpServerConfig, McpToolDefinition};

const MCP_PROTOCOL_VERSION: &str = "2024-11-05";
const CLIENT_NAME: &str = "coder";
const CLIENT_VERSION: &str = "0.1.0";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);
const INIT_TIMEOUT: Duration = Duration::from_secs(30);

pub struct McpClient {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<tokio::process::ChildStdout>,
    next_id: u64,
}

impl McpClient {
    pub async fn connect(config: &McpServerConfig) -> Result<Self, String> {
        if config.command.trim().is_empty() {
            return Err("MCP server command is required".to_string());
        }

        let mut command = Command::new(&config.command);
        command
            .args(&config.args)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true);

        for (key, value) in &config.env {
            command.env(key, value);
        }

        let mut child = command
            .spawn()
            .map_err(|e| format!("Failed to spawn MCP server '{}': {e}", config.command))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Failed to open MCP server stdin".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to open MCP server stdout".to_string())?;

        let mut client = Self {
            child,
            stdin,
            stdout: BufReader::new(stdout),
            next_id: 0,
        };

        client.initialize().await?;
        Ok(client)
    }

    async fn initialize(&mut self) -> Result<(), String> {
        let params = json!({
            "protocolVersion": MCP_PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": {
                "name": CLIENT_NAME,
                "version": CLIENT_VERSION,
            }
        });

        let response = timeout(INIT_TIMEOUT, self.request("initialize", Some(params)))
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
                Some(c) => json!({ "cursor": c }),
                None => json!({}),
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
        let params = json!({
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

        let mut payload = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
        });
        if let Some(params) = params {
            payload["params"] = params;
        }

        self.write_message(&payload).await?;
        self.read_response_for_id(id).await
    }

    async fn notify(&mut self, method: &str, params: Option<Value>) -> Result<(), String> {
        let mut payload = json!({
            "jsonrpc": "2.0",
            "method": method,
        });
        if let Some(params) = params {
            payload["params"] = params;
        }
        self.write_message(&payload).await
    }

    async fn write_message(&mut self, payload: &Value) -> Result<(), String> {
        let line = serde_json::to_string(payload)
            .map_err(|e| format!("Failed to serialize MCP message: {e}"))?;
        self.stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| format!("Failed to write to MCP server: {e}"))?;
        self.stdin
            .write_all(b"\n")
            .await
            .map_err(|e| format!("Failed to write newline to MCP server: {e}"))?;
        self.stdin
            .flush()
            .await
            .map_err(|e| format!("Failed to flush MCP server stdin: {e}"))?;
        Ok(())
    }

    async fn read_response_for_id(&mut self, id: u64) -> Result<Value, String> {
        let mut line = String::new();

        loop {
            line.clear();
            let bytes_read = self
                .stdout
                .read_line(&mut line)
                .await
                .map_err(|e| format!("Failed to read MCP server output: {e}"))?;

            if bytes_read == 0 {
                let exit_status = self.child.try_wait().ok().flatten();
                return Err(format!(
                    "MCP server closed stdout before responding (status: {:?})",
                    exit_status
                ));
            }

            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let message: Value = serde_json::from_str(trimmed)
                .map_err(|e| format!("Invalid JSON from MCP server: {e} (line: {trimmed})"))?;

            if message.get("method").is_some() && message.get("id").is_none() {
                // Server notification — ignore for now.
                continue;
            }

            if message.get("id").and_then(|v| v.as_u64()) == Some(id) {
                return Ok(message);
            }
        }
    }
}

impl Drop for McpClient {
    fn drop(&mut self) {
        let _ = self.child.start_kill();
    }
}

fn parse_content_blocks(value: Option<&Value>) -> Result<Vec<McpContentBlock>, String> {
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

fn format_mcp_error(method: &str, response: &Value) -> String {
    response
        .get("error")
        .map(|error| format_json_error(method, error))
        .unwrap_or_else(|| format!("MCP {method} failed"))
}

fn format_json_error(method: &str, error: &Value) -> String {
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

pub fn config_hash(config: &McpServerConfig) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    config.command.hash(&mut hasher);
    config.args.hash(&mut hasher);
    let mut env_pairs: Vec<_> = config.env.iter().collect();
    env_pairs.sort_by(|a, b| a.0.cmp(b.0));
    for (key, value) in env_pairs {
        key.hash(&mut hasher);
        value.hash(&mut hasher);
    }
    hasher.finish()
}
