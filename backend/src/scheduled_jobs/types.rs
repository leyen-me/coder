use serde::{Deserialize, Serialize};

pub const STORE: &str = "scheduled_jobs";
pub const MAX_RUNS: usize = 50;
pub const STALE_RUN_MS: i64 = 2 * 60 * 60 * 1000;
pub const SCHEDULER_INTERVAL_SECS: u64 = 30;

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
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub task_id: String,
    pub session_id: String,
    pub started_at: i64,
    pub completed_at: Option<i64>,
    pub summary: String,
    pub status: RunStatus,
}

impl JobRunRecord {
    pub fn normalize(mut self) -> Self {
        self.id = self.id.trim().to_string();
        self.task_id = self.task_id.trim().to_string();
        self.session_id = self.session_id.trim().to_string();
        self.summary = self.summary.trim().to_string();

        if self.task_id.is_empty() {
            self.task_id = if !self.id.is_empty() {
                self.id.clone()
            } else {
                self.session_id.clone()
            };
        }
        if self.id.is_empty() {
            self.id = if !self.task_id.is_empty() {
                self.task_id.clone()
            } else {
                self.session_id.clone()
            };
        }

        self
    }
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
    /// 每次运行时会话附带的 MCP 服务 id。
    #[serde(default)]
    pub attached_mcp_servers: Vec<String>,
    pub enabled: bool,
    #[serde(default)]
    pub runs: Vec<JobRunRecord>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl ScheduledJobRecord {
    pub fn normalize(mut self) -> Self {
        self.id = self.id.trim().to_string();
        self.name = self.name.trim().to_string();
        self.description = self.description.trim().to_string();
        self.cron_expression = self.cron_expression.trim().to_string();
        self.prompt = self.prompt.trim().to_string();
        self.workspace_dir = self
            .workspace_dir
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        self.model = self.model.trim().to_string();
        self.provider = self.provider.trim().to_string();
        self.runs = self.runs.into_iter().map(JobRunRecord::normalize).collect();
        let mut seen = Vec::new();
        self.attached_mcp_servers.retain(|server| {
            let trimmed = server.trim().to_string();
            !trimmed.is_empty() && !seen.contains(&trimmed) && {
                seen.push(trimmed);
                true
            }
        });
        self
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationRecord {
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
    #[serde(default)]
    pub attached_mcp_servers: Vec<String>,
    pub enabled: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

impl From<ScheduledJobRecord> for AutomationRecord {
    fn from(record: ScheduledJobRecord) -> Self {
        Self {
            id: record.id,
            name: record.name,
            description: record.description,
            cron_expression: record.cron_expression,
            prompt: record.prompt,
            workspace_dir: record.workspace_dir,
            model: record.model,
            provider: record.provider,
            agent_mode: record.agent_mode,
            thinking_enabled: record.thinking_enabled,
            attached_mcp_servers: record.attached_mcp_servers,
            enabled: record.enabled,
            created_at: record.created_at,
            updated_at: record.updated_at,
        }
    }
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
    #[serde(default)]
    pub attached_mcp_servers: Vec<String>,
    #[serde(default)]
    pub enabled: Option<bool>,
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
    pub attached_mcp_servers: Option<Vec<String>>,
    pub enabled: Option<bool>,
}
