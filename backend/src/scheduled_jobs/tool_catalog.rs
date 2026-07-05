use crate::agent::AgentToolDefinition;

use super::types::AgentMode;

pub fn tool_definitions(mode: &AgentMode, enable_email: bool) -> Vec<AgentToolDefinition> {
    let mut tools = match mode {
        AgentMode::Ask => load_embedded_tools(include_str!("assets/agent_tools_ask.json")),
        AgentMode::Agent => load_embedded_tools(include_str!("assets/agent_tools_agent.json")),
    };

    if enable_email && matches!(mode, AgentMode::Agent) {
        if let Ok(mut email_tools) =
            serde_json::from_str::<Vec<AgentToolDefinition>>(include_str!(
                "assets/agent_tools_email.json"
            ))
        {
            tools.append(&mut email_tools);
        }
    }

    tools
}

fn load_embedded_tools(raw: &str) -> Vec<AgentToolDefinition> {
    serde_json::from_str(raw).unwrap_or_default()
}
