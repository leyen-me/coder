use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde_json::Value;

use super::oauth::McpOAuthStore;
use super::session::McpSession;
use super::stdio_client::config_hash;
use super::types::{
    McpCallToolResult, McpListToolsResult, McpOAuthStartResult, McpOAuthStatusResult,
    McpServerConfig, McpTestConnectionResult,
};

struct CachedSession {
    config_hash: u64,
    client: McpSession,
}

pub struct McpRegistry {
    sessions: Mutex<HashMap<String, CachedSession>>,
    pub oauth_store: Arc<McpOAuthStore>,
}

impl McpRegistry {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            oauth_store: Arc::new(McpOAuthStore::new()),
        }
    }

    pub async fn list_tools(&self, config: McpServerConfig) -> Result<McpListToolsResult, String> {
        let mut client = self.get_or_connect(&config).await?;
        let tools = client.list_tools().await?;
        self.store_session(&config, client);

        Ok(McpListToolsResult {
            server_id: config.id.clone(),
            server_name: config.name.clone(),
            tools,
        })
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
