use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::agent::TokenUsage;

pub const SESSIONS_STORE: &str = "sessions";
pub const MESSAGES_STORE: &str = "messages";
pub const AGENT_TODOS_STORE: &str = "agentTodos";

pub const MESSAGE_KIND_COMPACT: &str = "compact";

pub const DEFAULT_SESSION_KIND: &str = "standard";
pub const DEFAULT_AUTONOMY_MODE: &str = "interactive";
pub const DEFAULT_DECISION_POLICY_VERSION: &str = "mvp-v1";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionContextUsageSnapshot {
    pub used_tokens: u32,
    pub max_tokens: u32,
    pub remaining_tokens: u32,
    pub reserved_tokens: u32,
    pub trigger_threshold: f64,
    pub source: String,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecord {
    pub id: String,
    pub title: String,
    pub model: String,
    pub provider: String,
    pub workspace_dir: Option<String>,
    pub session_kind: String,
    pub autonomy_mode: String,
    pub decision_policy_version: String,
    pub decision_model: Option<String>,
    pub parent_session_id: Option<String>,
    pub plan_file_name: Option<String>,
    pub plan_built_at: Option<u64>,
    pub context_usage_snapshot: Option<SessionContextUsageSnapshot>,
    pub pinned_at: Option<u64>,
    /// Per-session MCP attachment. Holds the server ids the user toggled on for
    /// THIS conversation. `None`/empty means nothing attached (pure on-demand:
    /// a server being `enabled` only makes it *selectable*, not auto-loaded).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attached_mcp_servers: Option<Vec<String>>,
    pub created_at: u64,
    pub updated_at: u64,
}

impl SessionRecord {
    pub fn normalize(mut self) -> Self {
        self.title = self.title.trim().to_string();
        self.model = self.model.trim().to_string();
        self.provider = normalize_provider(&self.provider, &self.model);
        self.workspace_dir = normalize_optional_string(self.workspace_dir);
        self.session_kind = match self.session_kind.trim() {
            "long_task" => "long_task".to_string(),
            _ => DEFAULT_SESSION_KIND.to_string(),
        };
        self.autonomy_mode = match self.autonomy_mode.trim() {
            "unattended" => "unattended".to_string(),
            _ => DEFAULT_AUTONOMY_MODE.to_string(),
        };
        self.decision_policy_version = if self.decision_policy_version.trim().is_empty() {
            DEFAULT_DECISION_POLICY_VERSION.to_string()
        } else {
            self.decision_policy_version.trim().to_string()
        };
        self.decision_model = normalize_optional_string(self.decision_model);
        self.parent_session_id = normalize_optional_string(self.parent_session_id);
        self.plan_file_name = normalize_optional_string(self.plan_file_name);
        self.attached_mcp_servers = self
            .attached_mcp_servers
            .map(|servers| {
                servers
                    .into_iter()
                    .map(|server| server.trim().to_string())
                    .filter(|server| !server.is_empty())
                    .collect::<Vec<String>>()
            })
            .filter(|servers: &Vec<String>| !servers.is_empty());
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageImageAttachment {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media_type: Option<String>,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageToolInvocation {
    pub id: String,
    pub name: String,
    pub input: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_text: Option<String>,
    pub state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum MessageProcessStep {
    Reasoning { id: String, text: String },
    Answer { id: String, text: String },
    Tool {
        id: String,
        #[serde(alias = "toolCallId")]
        tool_call_id: String,
    },
    /// Mid-turn auto-compact — rendered inside the assistant process panel.
    Compact {
        id: String,
        /// `running` | `completed` | `error`
        state: String,
        #[serde(default, alias = "removedCount")]
        removed_count: u32,
        #[serde(default)]
        preview: String,
        #[serde(default, skip_serializing_if = "Option::is_none", alias = "compactMessageId")]
        compact_message_id: Option<String>,
    },
    Decision {
        id: String,
        trigger: String,
        summary: String,
        question: String,
        options: Vec<DecisionOptionRecord>,
        #[serde(alias = "riskLevel")]
        risk_level: String,
        status: String,
        #[serde(alias = "requiresUserConfirmation")]
        requires_user_confirmation: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        response: Option<DecisionResponseRecord>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionOptionRecord {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionResponseRecord {
    pub outcome: String,
    #[serde(alias = "selectedOptionId")]
    pub selected_option_id: Option<String>,
    pub reason: String,
    #[serde(alias = "riskLevel")]
    pub risk_level: String,
    #[serde(alias = "recordAsAssumption")]
    pub record_as_assumption: bool,
    #[serde(alias = "requiresUserConfirmation")]
    pub requires_user_confirmation: bool,
    pub assumption: Option<String>,
    #[serde(alias = "suggestedContinuation")]
    pub suggested_continuation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageRecord {
    pub id: String,
    pub session_id: String,
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_kind: Option<String>,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub images: Option<Vec<MessageImageAttachment>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub referenced_skills: Option<Vec<String>>,
    pub thinking: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub process_steps: Option<Vec<MessageProcessStep>>,
    pub tool_invocations: Vec<MessageToolInvocation>,
    pub status: String,
    pub task_id: Option<String>,
    pub error: Option<String>,
    pub created_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<TokenUsage>,
}

impl MessageRecord {
    pub fn normalize(mut self) -> Self {
        self.session_id = self.session_id.trim().to_string();
        self.role = self.role.trim().to_string();
        self.message_kind = normalize_optional_string(self.message_kind);
        self.task_id = normalize_optional_string(self.task_id);
        self.error = normalize_optional_string(self.error);
        self.referenced_skills = self
            .referenced_skills
            .map(|skills| skills.into_iter().filter_map(|skill| normalize_optional_string(Some(skill))).collect())
            .filter(|skills: &Vec<String>| !skills.is_empty());
        self.images = self.images.filter(|images| !images.is_empty());
        self.process_steps = self.process_steps.filter(|steps| !steps.is_empty());
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTodoRecord {
    pub id: String,
    pub session_id: String,
    pub content: String,
    pub status: String,
    pub order: u32,
    pub created_at: u64,
    pub updated_at: u64,
}

impl AgentTodoRecord {
    pub fn normalize(mut self) -> Self {
        self.session_id = self.session_id.trim().to_string();
        self.content = self.content.trim().to_string();
        self.status = normalize_todo_status(&self.status);
        self
    }
}

pub fn current_timestamp_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}

pub fn normalize_provider(stored_provider: &str, model_id: &str) -> String {
    let trimmed = stored_provider.trim().to_ascii_lowercase();
    if matches!(
        trimmed.as_str(),
        "deepseek" | "glm" | "agnes" | "minimax" | "nvidia" | "custom"
    ) {
        return trimmed;
    }
    let model = model_id.trim().to_ascii_lowercase();
    if model.starts_with("deepseek") {
        "deepseek".to_string()
    } else if model.starts_with("glm") {
        "glm".to_string()
    } else if model.starts_with("agnes") {
        "agnes".to_string()
    } else {
        "custom".to_string()
    }
}

pub fn normalize_todo_status(status: &str) -> String {
    match status.trim() {
        "in_progress" => "in_progress".to_string(),
        "completed" => "completed".to_string(),
        "cancelled" => "cancelled".to_string(),
        _ => "pending".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::MessageProcessStep;

    #[test]
    fn decision_step_deserializes_legacy_camel_case_fields() {
        let raw = serde_json::json!({
            "id": "decision:1",
            "kind": "decision",
            "trigger": "final_answer",
            "summary": "summary",
            "question": "question",
            "options": [
                { "id": "complete", "label": "Complete" },
                { "id": "continue", "label": "Continue" }
            ],
            "riskLevel": "medium",
            "status": "requested",
            "requiresUserConfirmation": false,
            "response": {
                "outcome": "continue",
                "selectedOptionId": "continue",
                "reason": "Need more work",
                "riskLevel": "medium",
                "recordAsAssumption": false,
                "requiresUserConfirmation": false,
                "assumption": null,
                "suggestedContinuation": "Keep going"
            }
        });

        let step: MessageProcessStep =
            serde_json::from_value(raw).expect("decision step should deserialize");

        match step {
            MessageProcessStep::Decision {
                risk_level,
                requires_user_confirmation,
                response,
                ..
            } => {
                assert_eq!(risk_level, "medium");
                assert!(!requires_user_confirmation);
                let response = response.expect("response");
                assert_eq!(response.selected_option_id.as_deref(), Some("continue"));
                assert_eq!(response.risk_level, "medium");
                assert_eq!(
                    response.suggested_continuation.as_deref(),
                    Some("Keep going")
                );
            }
            _ => panic!("expected decision step"),
        }
    }
}
