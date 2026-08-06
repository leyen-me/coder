use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde_json::Value;

use super::oauth::McpOAuthStore;
use super::session::McpSession;
use super::stdio_client::config_hash;
use super::types::{
    McpCallToolResult, McpListToolsResult, McpOAuthStartResult, McpOAuthStatusResult,
    McpServerConfig, McpTestConnectionResult, McpToolDefinition,
};

struct CachedSession {
    config_hash: u64,
    client: McpSession,
}

/// Last successfully fetched tool list for a server, guarded by the config hash.
///
/// When a live `list_tools` call fails (connection or protocol error), the
/// registry falls back to this snapshot so transient MCP outages do not
/// silently drop tools from agent requests. A config change invalidates the
/// cache because `config_hash` no longer matches.
#[derive(Clone)]
struct CachedToolList {
    config_hash: u64,
    tools: Vec<McpToolDefinition>,
}

pub struct McpRegistry {
    sessions: Mutex<HashMap<String, CachedSession>>,
    tools_cache: Mutex<HashMap<String, CachedToolList>>,
    pub oauth_store: Arc<McpOAuthStore>,
}

impl McpRegistry {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            tools_cache: Mutex::new(HashMap::new()),
            oauth_store: Arc::new(McpOAuthStore::new()),
        }
    }

    pub async fn list_tools(&self, config: McpServerConfig) -> Result<McpListToolsResult, String> {
        let hash = config_hash(&config);
        match self.fetch_live_tools(&config).await {
            Ok(tools) => {
                self.store_tools_cache(&config, hash, tools.clone());
                Ok(McpListToolsResult {
                    server_id: config.id.clone(),
                    server_name: config.name.clone(),
                    tools,
                })
            }
            Err(error) => {
                // Reuse the last successful tool list for this exact config so a
                // transient MCP outage does not change the tool set seen by the
                // agent (a suddenly smaller catalog would break prompt-cache
                // hits and confuse the model).
                let cached = self.read_tools_cache(&config.id, hash);
                match cached {
                    Some(tools) => {
                        log::warn!(
                            "mcp_list_tools_fallback server_id={} cached_tools={} error={}",
                            config.id,
                            tools.len(),
                            error
                        );
                        Ok(McpListToolsResult {
                            server_id: config.id.clone(),
                            server_name: config.name.clone(),
                            tools,
                        })
                    }
                    None => Err(error),
                }
            }
        }
    }

    async fn fetch_live_tools(
        &self,
        config: &McpServerConfig,
    ) -> Result<Vec<McpToolDefinition>, String> {
        let mut client = self.get_or_connect(config).await?;
        let tools = client.list_tools().await?;
        self.store_session(config, client);
        Ok(tools)
    }

    fn store_tools_cache(&self, config: &McpServerConfig, hash: u64, tools: Vec<McpToolDefinition>) {
        if let Ok(mut cache) = self.tools_cache.lock() {
            cache.insert(
                config.id.clone(),
                CachedToolList {
                    config_hash: hash,
                    tools,
                },
            );
        }
    }

    fn read_tools_cache(&self, server_id: &str, hash: u64) -> Option<Vec<McpToolDefinition>> {
        self.tools_cache
            .lock()
            .ok()
            .and_then(|cache| cache.get(server_id).cloned())
            .filter(|cached| cached.config_hash == hash)
            .map(|cached| cached.tools)
    }

    pub async fn call_tool(
        &self,
        config: McpServerConfig,
        tool_name: String,
        arguments: Value,
    ) -> Result<McpCallToolResult, String> {
        let mut client = self.get_or_connect(&config).await?;
        let (content, is_error) = client.call_tool(&tool_name, arguments).await?;
        self.store_session(&config, client);

        Ok(McpCallToolResult {
            server_id: config.id,
            tool_name,
            content,
            is_error,
        })
    }

    pub async fn test_connection(
        &self,
        config: McpServerConfig,
    ) -> Result<McpTestConnectionResult, String> {
        let auth_required = config.is_remote() && !self.oauth_store.status(&config.id).authenticated;

        match McpSession::connect(&config, self.oauth_store.clone()).await {
            Ok(mut client) => match client.list_tools().await {
                Ok(tools) => {
                    let count = tools.len();
                    Ok(McpTestConnectionResult {
                        ok: true,
                        message: format!("Connected successfully. Found {count} tool(s)."),
                        tool_count: count,
                        auth_required: Some(false),
                    })
                }
                Err(error) => {
                    let needs_auth = error.contains("authentication required")
                        || error.contains("401");
                    Ok(McpTestConnectionResult {
                        ok: false,
                        message: error,
                        tool_count: 0,
                        auth_required: Some(needs_auth || auth_required),
                    })
                }
            },
            Err(error) => {
                let needs_auth = error.contains("authentication required")
                    || error.contains("401");
                Ok(McpTestConnectionResult {
                    ok: false,
                    message: error,
                    tool_count: 0,
                    auth_required: Some(needs_auth || auth_required),
                })
            }
        }
    }

    pub async fn start_oauth(
        &self,
        config: McpServerConfig,
        redirect_uri: String,
    ) -> Result<McpOAuthStartResult, String> {
        let (authorize_url, state) = self
            .oauth_store
            .start_authorization(config, &redirect_uri)
            .await?;

        Ok(McpOAuthStartResult {
            authorize_url,
            state,
            status: "pending".to_string(),
        })
    }

    pub async fn complete_oauth(
        &self,
        state: &str,
        code: &str,
        redirect_uri: &str,
    ) -> Result<String, String> {
        self.oauth_store
            .complete_authorization(state, code, redirect_uri)
            .await
    }

    pub fn oauth_status(&self, server_id: &str) -> McpOAuthStatusResult {
        let status = self.oauth_store.status(server_id);
        McpOAuthStatusResult {
            authenticated: status.authenticated,
            expires_at: status.expires_at,
            message: status.message,
        }
    }

    pub fn revoke_oauth(&self, server_id: &str) {
        self.oauth_store.revoke(server_id);
        self.disconnect(server_id);
    }

    pub fn disconnect(&self, server_id: &str) {
        if let Ok(mut sessions) = self.sessions.lock() {
            sessions.remove(server_id);
        }
    }

    async fn get_or_connect(&self, config: &McpServerConfig) -> Result<McpSession, String> {
        let hash = config_hash(config);

        if let Ok(mut sessions) = self.sessions.lock() {
            if let Some(cached) = sessions.remove(&config.id) {
                if cached.config_hash == hash {
                    return Ok(cached.client);
                }
            }
        }

        McpSession::connect(config, self.oauth_store.clone()).await
    }

    fn store_session(&self, config: &McpServerConfig, client: McpSession) {
        if let Ok(mut sessions) = self.sessions.lock() {
            sessions.insert(
                config.id.clone(),
                CachedSession {
                    config_hash: config_hash(config),
                    client,
                },
            );
        }
    }
}

impl Default for McpRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use serde_json::json;

    use super::*;

    /// A config that fails fast in `StdioMcpClient::connect` (empty command),
    /// so tests exercise the failure path without network or processes.
    fn unreachable_config(id: &str) -> McpServerConfig {
        McpServerConfig {
            id: id.to_string(),
            name: id.to_string(),
            transport: "stdio".to_string(),
            command: String::new(),
            args: Vec::new(),
            env: HashMap::new(),
            url: String::new(),
            headers: Default::default(),
            enabled: true,
        }
    }

    fn sample_tool(name: &str) -> McpToolDefinition {
        McpToolDefinition {
            name: name.to_string(),
            description: Some("test tool".to_string()),
            input_schema: json!({ "type": "object", "properties": {} }),
        }
    }

    fn seed_cache(registry: &McpRegistry, config: &McpServerConfig, tools: Vec<McpToolDefinition>) {
        registry.store_tools_cache(config, config_hash(config), tools);
    }

    #[tokio::test]
    async fn list_tools_falls_back_to_cached_tools_on_connect_failure() {
        let registry = McpRegistry::new();
        let config = unreachable_config("srv");
        seed_cache(&registry, &config, vec![sample_tool("read"), sample_tool("write")]);

        let result = registry
            .list_tools(config)
            .await
            .expect("should reuse the last successful tool list");
        assert_eq!(result.server_id, "srv");
        assert_eq!(result.tools.len(), 2);
        assert_eq!(result.tools[0].name, "read");
        assert_eq!(result.tools[1].name, "write");
    }

    #[tokio::test]
    async fn list_tools_returns_error_when_no_cache_exists() {
        let registry = McpRegistry::new();
        let config = unreachable_config("srv");

        let error = registry
            .list_tools(config)
            .await
            .expect_err("without a cache the failure must be surfaced");
        assert!(!error.is_empty());
    }

    #[tokio::test]
    async fn list_tools_cache_is_invalidated_by_config_change() {
        let registry = McpRegistry::new();
        let cached_config = unreachable_config("srv");
        seed_cache(&registry, &cached_config, vec![sample_tool("read")]);

        let mut changed = cached_config.clone();
        changed.url = "http://changed.example".to_string();

        let error = registry
            .list_tools(changed)
            .await
            .expect_err("a config mismatch must not reuse the cache");
        assert!(!error.is_empty());
    }
}
