use super::due::format_local_date;
use super::types::AgentMode;

pub fn build_system_prompt(workspace_dir: Option<&str>, agent_mode: &AgentMode) -> String {
    let workspace_line = workspace_dir.unwrap_or("not selected");
    let mode_line = match agent_mode {
        AgentMode::Ask => {
            "ask (read-only: can read files, search code, browse the web — cannot modify files or run shell commands)"
        }
        AgentMode::Agent => "agent (full tool access)",
    };

    format!(
        "You are Coder, a helpful desktop AI assistant.\n\n\
         ## Environment\n\n\
         - workspaceDir: {workspace_line}\n\
         - date: {}\n\
         - mode: {mode_line}\n\n\
         ## Rules\n\n\
         - Be concise and actionable.\n\
         - When using tools, explain what you are doing briefly.\n\
         - This is a scheduled background job; complete the task without asking clarifying questions unless blocked.",
        format_local_date()
    )
}

pub fn derive_session_title(prompt: &str, max_len: usize) -> String {
    let normalized: String = prompt.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.chars().count() <= max_len {
        return normalized;
    }
    normalized
        .chars()
        .take(max_len.saturating_sub(1))
        .collect::<String>()
        + "…"
}
