pub mod ask_question;
pub mod cancel;
pub mod compact;
pub mod compact_prompt;
pub mod context;
pub mod decision;
pub mod event_log;
pub mod loop_;
pub mod messages;
pub mod openai;
pub mod registry;
pub mod spawn;
pub mod tool_dispatch;
mod stream_log;
mod types;

use std::sync::{Arc, Mutex};

use registry::{generate_session_title, refine_prompt, AgentRegistry};
pub use types::{
    AgentContextUsageSnapshot, AgentEvent, AgentStartParams, AgentStatus, AgentStatusResponse, AgentToolDefinition,
    ApiToolCall, ApiToolCallFunction, ChatMessage, GenerateSessionTitleParams,
    RefineContextMessage, RefinePromptParams, ToolCall,
    TokenUsage,
};
pub use messages::{
    assemble_agent_messages, build_system_prompt_preview, resolve_agent_tool_definitions,
};
pub use stream_log::{agent_diagnostic_file_log, cleanup_agent_log_dirs};

pub struct AgentState(pub Arc<Mutex<AgentRegistry>>);

pub fn agent_get_status(
    registry: &Mutex<AgentRegistry>,
    task_id: String,
) -> Result<Option<AgentStatusResponse>, String> {
    let r = registry
        .lock()
        .map_err(|_| "Agent registry lock poisoned".to_string())?;
    Ok(r.get_status(&task_id))
}

pub fn agent_get_session_status(
    registry: &Mutex<AgentRegistry>,
    session_id: String,
) -> Result<Option<AgentStatusResponse>, String> {
    let r = registry
        .lock()
        .map_err(|_| "Agent registry lock poisoned".to_string())?;
    Ok(r.get_session_status(&session_id))
}

pub fn agent_replay_events(
    registry: &Mutex<AgentRegistry>,
    task_id: String,
    from_seq: u64,
) -> Result<Vec<String>, String> {
    let r = registry
        .lock()
        .map_err(|_| "Agent registry lock poisoned".to_string())?;
    Ok(r.replay_events_from(&task_id, from_seq))
}

pub fn agent_cancel(
    registry: &Mutex<AgentRegistry>,
    task_id: String,
) -> Result<(), String> {
    let mut r = registry
        .lock()
        .map_err(|_| "Agent registry lock poisoned".to_string())?;
    r.cancel(&task_id)
}

pub async fn agent_generate_session_title(
    registry: &Mutex<AgentRegistry>,
    params: GenerateSessionTitleParams,
) -> Result<Option<String>, String> {
    let client = {
        let r = registry
            .lock()
            .map_err(|_| "Agent registry lock poisoned".to_string())?;
        r.http_client()
    };
    generate_session_title(&client, params).await
}

pub async fn agent_refine_prompt(
    registry: &Mutex<AgentRegistry>,
    params: RefinePromptParams,
) -> Result<Option<String>, String> {
    let client = {
        let r = registry
            .lock()
            .map_err(|_| "Agent registry lock poisoned".to_string())?;
        r.http_client()
    };
    refine_prompt(&client, params).await
}

pub fn agent_start(
    registry: &Arc<Mutex<AgentRegistry>>,
    params: AgentStartParams,
    broadcaster: Arc<crate::SseBroadcaster>,
    app_state: Arc<crate::AppState>,
) -> Result<(), String> {
    let mut r = registry
        .lock()
        .map_err(|_| "Agent registry lock poisoned".to_string())?;
    r.start(params, broadcaster, registry.clone(), app_state)
}
