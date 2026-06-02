use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AgentStatus {
    Pending,
    Running,
    Cancelling,
    Cancelled,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiToolCallFunction {
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub function: ApiToolCallFunction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ApiToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentToolDefinition {
    #[serde(rename = "type")]
    pub kind: String,
    pub function: AgentToolFunction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentToolFunction {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum AgentEvent {
    Status {
        task_id: String,
        status: AgentStatus,
    },
    ThinkingDelta {
        task_id: String,
        delta: String,
    },
    ContentDelta {
        task_id: String,
        delta: String,
    },
    TurnComplete {
        task_id: String,
        tool_calls: Vec<ToolCall>,
    },
    Done {
        task_id: String,
    },
    Error {
        task_id: String,
        message: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStartParams {
    pub task_id: String,
    pub base_url: String,
    pub api_key: Option<String>,
    pub api_key_source: String,
    pub api_key_env_var: String,
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub tools: Option<Vec<AgentToolDefinition>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatusResponse {
    pub task_id: String,
    pub status: AgentStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateSessionTitleParams {
    pub base_url: String,
    pub api_key: Option<String>,
    pub api_key_source: String,
    pub api_key_env_var: String,
    pub model: String,
    pub user_message: String,
    pub assistant_message: String,
}
