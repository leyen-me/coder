mod openai;
pub mod registry;
mod types;

use std::sync::Mutex;

use registry::AgentRegistry;
use tauri::ipc::Channel;
use tauri::State;
pub use types::{
    AgentEvent, AgentStartParams, AgentStatusResponse,
};

pub struct AgentState(pub Mutex<AgentRegistry>);

#[tauri::command]
pub fn agent_get_status(
    state: State<'_, AgentState>,
    task_id: String,
) -> Result<Option<AgentStatusResponse>, String> {
    let registry = state.0.lock().map_err(|_| "Agent registry lock poisoned".to_string())?;
    Ok(registry.get_status(&task_id))
}

#[tauri::command]
pub fn agent_cancel(state: State<'_, AgentState>, task_id: String) -> Result<(), String> {
    let mut registry = state
        .0
        .lock()
        .map_err(|_| "Agent registry lock poisoned".to_string())?;
    registry.cancel(&task_id)
}

#[tauri::command]
pub fn agent_start(
    state: State<'_, AgentState>,
    params: AgentStartParams,
    on_event: Channel<AgentEvent>,
) -> Result<(), String> {
    let mut registry = state
        .0
        .lock()
        .map_err(|_| "Agent registry lock poisoned".to_string())?;
    registry.start(params, on_event)
}
