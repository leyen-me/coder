use std::sync::Arc;

use serde_json::Value;

use super::http_client::HttpMcpClient;
use super::oauth::McpOAuthStore;
use super::stdio_client::StdioMcpClient;
use super::types::{McpContentBlock, McpServerConfig, McpToolDefinition};

pub enum McpSession {
    Stdio(StdioMcpClient),
    Http(HttpMcpClient),
}

impl McpSession {
    pub async fn connect(
        config: &McpServerConfig,
        oauth_store: Arc<McpOAuthStore>,
    ) -> Result<Self, String> {
        if config.is_remote() {
            Ok(Self::Http(HttpMcpClient::connect(config, oauth_store).await?))
        } else {
            Ok(Self::Stdio(StdioMcpClient::connect(config).await?))
        }
    }

    pub async fn list_tools(&mut self) -> Result<Vec<McpToolDefinition>, String> {
        match self {
            Self::Stdio(client) => client.list_tools().await,
            Self::Http(client) => client.list_tools().await,
        }
    }

    pub async fn call_tool(
        &mut self,
        name: &str,
        arguments: Value,
    ) -> Result<(Vec<McpContentBlock>, bool), String> {
        match self {
            Self::Stdio(client) => client.call_tool(name, arguments).await,
            Self::Http(client) => client.call_tool(name, arguments).await,
        }
    }
}
