pub mod openai;
pub mod registry;
mod stream_log;
mod types;

use std::sync::{Arc, Mutex};

use registry::{generate_session_title, refine_prompt, AgentRegistry};
pub use types::{
    AgentEvent, AgentStartParams, AgentStatusResponse, AgentToolDefinition, ApiToolCall,
    ApiToolCallFunction, ChatMessage, GenerateSessionTitleParams, RefineContextMessage,
    RefinePromptParams, ToolCall,
};

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
) -> Result<(), String> {
    let mut r = registry
        .lock()
        .map_err(|_| "Agent registry lock poisoned".to_string())?;
    r.start(params, broadcaster, registry.clone())
}
