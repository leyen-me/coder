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
    /// OpenAI-compatible content: plain string or multimodal JSON array.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_content: Option<String>,
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
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentContextUsageSnapshot {
    pub used_tokens: u32,
    pub max_tokens: u32,
    pub remaining_tokens: u32,
    pub reserved_tokens: u32,
    pub trigger_threshold: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all_fields = "camelCase")]
pub enum AgentEvent {
    #[serde(rename = "status")]
    Status {
        task_id: String,
        status: AgentStatus,
    },
    #[serde(rename = "thinking_delta")]
    ThinkingDelta {
        task_id: String,
        delta: String,
    },
    #[serde(rename = "content_delta")]
    ContentDelta {
        task_id: String,
        delta: String,
    },
    #[serde(rename = "tool_call_pending")]
    ToolCallPending {
        task_id: String,
        tool_call_id: String,
        name: String,
    },
    #[serde(rename = "tool_call_started")]
    ToolCallStarted {
        task_id: String,
        tool_call_id: String,
        name: String,
        input: Value,
    },
    #[serde(rename = "tool_call_finished")]
    ToolCallFinished {
        task_id: String,
        tool_call_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        output: Option<Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error_text: Option<String>,
    },
    #[serde(rename = "turn_complete")]
    TurnComplete {
        task_id: String,
        tool_calls: Vec<ToolCall>,
    },
    #[serde(rename = "done")]
    Done {
        task_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        usage: Option<TokenUsage>,
    },
    #[serde(rename = "handoff_required")]
    HandoffRequired {
        task_id: String,
        context_usage: AgentContextUsageSnapshot,
    },
    #[serde(rename = "chat_retry")]
    ChatRetry {
        task_id: String,
        attempt: u32,
        max_attempts: u32,
    },
    #[serde(rename = "error")]
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
    pub request_extensions: Option<Value>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub emit_assistant_output: Option<bool>,
    #[serde(default)]
    pub max_context_tokens: Option<u32>,
    #[serde(default)]
    pub handoff_trigger_threshold: Option<f64>,
    #[serde(default)]
    pub agent_mode: Option<String>,
    #[serde(default)]
    pub thinking_enabled: Option<bool>,
    #[serde(default)]
    pub models: Option<Vec<Value>>,
    #[serde(default)]
    pub session_kind: Option<String>,
    #[serde(default)]
    pub autonomy_mode: Option<String>,
    #[serde(default)]
    pub decision_policy_version: Option<String>,
    #[serde(default)]
    pub decision_model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatusResponse {
    pub task_id: String,
    pub status: AgentStatus,
    #[serde(default)]
    pub last_seq: Option<u64>,
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefineContextMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefinePromptParams {
    pub base_url: String,
    pub api_key: Option<String>,
    pub api_key_source: String,
    pub api_key_env_var: String,
    pub model: String,
    pub user_prompt: String,
    pub system_prompt: String,
    pub context_messages: Vec<RefineContextMessage>,
}
