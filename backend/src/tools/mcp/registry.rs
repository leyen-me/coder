use std::collections::HashMap;
use std::sync::Mutex;

use serde_json::Value;

use super::client::{config_hash, McpClient};
use super::types::{
    McpCallToolResult, McpListToolsResult, McpServerConfig, McpTestConnectionResult,
};

struct CachedSession {
    config_hash: u64,
    client: McpClient,
}

pub struct McpRegistry {
    sessions: Mutex<HashMap<String, CachedSession>>,
}

impl McpRegistry {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
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
        match McpClient::connect(&config).await {
            Ok(mut client) => match client.list_tools().await {
                Ok(tools) => {
                    let count = tools.len();
                    Ok(McpTestConnectionResult {
                        ok: true,
                        message: format!("Connected successfully. Found {count} tool(s)."),
                        tool_count: count,
                    })
                }
                Err(error) => Ok(McpTestConnectionResult {
                    ok: false,
                    message: error,
                    tool_count: 0,
                }),
            },
            Err(error) => Ok(McpTestConnectionResult {
                ok: false,
                message: error,
                tool_count: 0,
            }),
        }
    }

    pub fn disconnect(&self, server_id: &str) {
        if let Ok(mut sessions) = self.sessions.lock() {
            sessions.remove(server_id);
        }
    }

    async fn get_or_connect(&self, config: &McpServerConfig) -> Result<McpClient, String> {
        let hash = config_hash(config);

        if let Ok(mut sessions) = self.sessions.lock() {
            if let Some(cached) = sessions.remove(&config.id) {
                if cached.config_hash == hash {
                    return Ok(cached.client);
                }
            }
        }

        McpClient::connect(config).await
    }

    fn store_session(&self, config: &McpServerConfig, client: McpClient) {
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
