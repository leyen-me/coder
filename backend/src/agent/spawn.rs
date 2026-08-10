use std::sync::Arc;

use serde_json::Value;
use uuid::Uuid;

use crate::agent::AgentToolDefinition;
use crate::db::records::{
    current_timestamp_ms, normalize_provider, SessionRecord, DEFAULT_AUTONOMY_MODE,
    DEFAULT_DECISION_POLICY_VERSION, DEFAULT_SESSION_KIND,
};
use crate::db::session_store::{get_session, new_session_id, put_session};
use crate::http::routes_tool::{start_agent_send_with_task_id, AgentSendParams};
use crate::AppState;

/// Options for spawning a new Session via the unified entry point.
///
/// Used by both Automation (`parent_session_id = None`) and SubAgent
/// (`parent_session_id = Some(parent.id)`). Title is always derived by
/// `derive_session_title` on first turn (same logic as a normal session),
/// so callers that need a custom title (e.g. Automation's "自动化 · " prefix)
/// should call `update_session` after `spawn_session` returns.
///
/// `provider` is derived from `model` via `normalize_provider` — same as
/// `start_agent_send_with_task_id` does internally — so callers don't need
/// to pass it.
#[derive(Debug, Clone)]
pub struct SpawnSessionOptions {
    pub parent_session_id: Option<String>,
    pub task: String,
    pub model: String,
    pub workspace_dir: Option<String>,
    pub base_url: String,
    pub api_key: Option<String>,
    pub api_key_source: Option<String>,
    pub api_key_env_var: Option<String>,
    pub request_extensions: Option<Value>,
    pub max_context_tokens: Option<u32>,
    pub compact_trigger_threshold: Option<f64>,
    pub agent_mode: Option<String>,
    pub thinking_enabled: Option<bool>,
    pub extra_tools: Option<Vec<AgentToolDefinition>>,
    pub denied_tools: Option<Vec<String>>,
    pub autonomy_mode: Option<String>,
    pub decision_policy_version: Option<String>,
    pub decision_model: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SpawnSessionResult {
    pub session_id: String,
    pub task_id: String,
    pub assistant_message_id: String,
    pub user_message_id: String,
}

/// Unified "create session + send user message + start agent loop" entry point.
///
/// This is the single source of truth shared by:
/// - Automation (`scheduled_jobs::runner`): `parent_session_id = None`
/// - SubAgent (`agent::tool_dispatch::execute_spawn_subagent`): `parent_session_id = Some(parent.id)`
///
/// Internally it calls `new_session_id` + `put_session` + `start_agent_send_with_task_id`.
/// The title is derived by `derive_session_title` on the first turn inside
/// `start_agent_send_with_task_id`, exactly matching normal session behavior.
pub async fn spawn_session(
    state: Arc<AppState>,
    opts: SpawnSessionOptions,
) -> Result<SpawnSessionResult, String> {
    let session_id = new_session_id();
    let task_id = Uuid::new_v4().to_string();
    let now = current_timestamp_ms();
    let provider = normalize_provider("", &opts.model);

    // 1. Create the SessionRecord. parent_session_id links child → parent.
    //    Title starts empty; start_agent_send_with_task_id will derive it on
    //    first turn (same as a normal session), satisfying "SubAgent == Session".
    //    A sub-agent inherits the parent's per-session MCP attachment (on-demand
    //    model): what the parent had toggled on carries into the child.
    let mut attached_mcp_servers: Option<Vec<String>> = None;
    let session = SessionRecord {
        id: session_id.clone(),
        title: String::new(),
        model: opts.model.clone(),
        provider,
        workspace_dir: opts.workspace_dir.clone(),
        session_kind: DEFAULT_SESSION_KIND.to_string(),
        autonomy_mode: opts
            .autonomy_mode
            .clone()
            .unwrap_or_else(|| DEFAULT_AUTONOMY_MODE.to_string()),
        decision_policy_version: opts
            .decision_policy_version
            .clone()
            .unwrap_or_else(|| DEFAULT_DECISION_POLICY_VERSION.to_string()),
        decision_model: opts.decision_model.clone(),
        parent_session_id: opts.parent_session_id.clone(),
        plan_file_name: None,
        plan_built_at: None,
        context_usage_snapshot: None,
        pinned_at: None,
        attached_mcp_servers: attached_mcp_servers.clone(),
        created_at: now,
        updated_at: now,
    };

    {
        let db = state
            .db
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;
        if let Some(pid) = &opts.parent_session_id {
            if let Ok(Some(parent)) = get_session(&db, pid) {
                attached_mcp_servers = parent.attached_mcp_servers;
            }
        }
        let session = SessionRecord {
            attached_mcp_servers: attached_mcp_servers.clone(),
            ..session
        };
        put_session(&db, &session)?;
    }

    // 2. Send the user message + start the agent loop. Reuses the exact same
    //    code path as the HTTP `/api/agent/send` route — no SubAgent-specific
    //    execution logic.
    let response = start_agent_send_with_task_id(
        state,
        AgentSendParams {
            session_id: session_id.clone(),
            content: opts.task,
            images: None,
            edit_message_id: None,
            referenced_skills: None,
            base_url: opts.base_url,
            api_key: opts.api_key,
            api_key_source: opts.api_key_source,
            api_key_env_var: opts.api_key_env_var,
            model: opts.model,
            request_extensions: opts.request_extensions,
            max_context_tokens: opts.max_context_tokens,
            compact_trigger_threshold: opts.compact_trigger_threshold,
            agent_mode: opts.agent_mode,
            thinking_enabled: opts.thinking_enabled,
            models: None,
            extra_tools: opts.extra_tools,
            denied_tools: opts.denied_tools,
        },
        task_id.clone(),
    )
    .await
    .map_err(|(_, message)| message)?;

    Ok(SpawnSessionResult {
        session_id,
        task_id,
        assistant_message_id: response.assistant_message_id,
        user_message_id: response.user_message_id,
    })
}
