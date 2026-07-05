use serde::{Deserialize, Serialize};

pub const STORE: &str = "scheduled_jobs";
pub const SESSIONS_STORE: &str = "sessions";
pub const MESSAGES_STORE: &str = "messages";
pub const MAX_RUNS: usize = 50;
pub const STALE_RUN_MS: i64 = 2 * 60 * 60 * 1000;
pub const SCHEDULER_INTERVAL_SECS: u64 = 30;
pub const MAX_AGENT_TURNS: usize = 64;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AgentMode {
    Agent,
    Ask,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RunStatus {
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobRunRecord {
    pub id: String,
    pub session_id: String,
    pub started_at: i64,
    pub completed_at: Option<i64>,
    pub summary: String,
    pub status: RunStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledJobRecord {
    pub id: String,
    pub name: String,
    pub description: String,
    pub cron_expression: String,
    pub prompt: String,
    pub workspace_dir: Option<String>,
    pub model: String,
    pub provider: String,
    pub agent_mode: AgentMode,
    pub thinking_enabled: bool,
    pub enabled: bool,
    pub enable_email: bool,
    #[serde(default)]
    pub runs: Vec<JobRunRecord>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateJobInput {
    pub name: String,
    pub description: String,
    pub cron_expression: String,
    pub prompt: String,
    pub workspace_dir: Option<String>,
    pub model: String,
    pub provider: Option<String>,
    pub agent_mode: AgentMode,
    pub thinking_enabled: bool,
    pub enable_email: bool,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateJobInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub cron_expression: Option<String>,
    pub prompt: Option<String>,
    pub workspace_dir: Option<String>,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub agent_mode: Option<AgentMode>,
    pub thinking_enabled: Option<bool>,
    pub enabled: Option<bool>,
    pub enable_email: Option<bool>,
}
