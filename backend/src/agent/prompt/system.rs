use chrono::Local;

use crate::tools::agent_get_runtime_environment;

use super::lab_settings;
use super::session_policy::{build_session_policy_prompt, SessionPolicyInput};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgentPromptMode {
    Agent,
    Ask,
    Plan,
}

pub struct BuildSystemPromptInput {
    pub workspace_dir: Option<String>,
    pub agent_mode: AgentPromptMode,
    /// Appended as numbered rules under `## Communication Rules`.
    pub extra_communication_rules: Vec<String>,
    pub session_policy: Option<SessionPolicyInput>,
}

pub fn build_system_prompt(input: BuildSystemPromptInput) -> Result<String, String> {
    let runtime = agent_get_runtime_environment(input.workspace_dir.clone())?;

    let workspace_line = input
        .workspace_dir
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("not selected");

    let git_line = if runtime.is_git_repository {
        "yes"
    } else if workspace_line == "not selected" {
        "unknown"
    } else {
        "no"
    };

    let mode_line = match input.agent_mode {
        AgentPromptMode::Ask => "ask (read-only: can read files, search code, browse the web, and list skills — cannot modify files or run shell commands)",
        AgentPromptMode::Plan => "plan (planning: can read files, search, browse, manage .plan/ files and todos — cannot modify project files or run shell commands)",
        AgentPromptMode::Agent => "agent (full tool access)",
    };

    let mut blocks = Vec::new();

    blocks.push(format!(
        "{identity}\n\n## Environment\n\n- workspaceDir: {workspace_line}\n- os: {os}\n- shell: {shell}\n- gitRepository: {git_line}\n- date: {date}\n- mode: {mode_line}",
        identity = lab_settings::resolve_identity_line(),
        os = runtime.os,
        shell = runtime.shell,
        date = format_today(),
    ));

    blocks.push(build_communication_rules(&input.extra_communication_rules));
    blocks.push(build_user_skills_section(input.agent_mode));

    if let Some(agents_md) = runtime.agents_md {
        if !agents_md.content.trim().is_empty() {
            blocks.push(build_project_instructions_section(
                &agents_md.content,
                agents_md.truncated,
            ));
        }
    }

    if let Some(mode_guidance) = build_mode_guidance(input.agent_mode, workspace_line) {
        blocks.push(mode_guidance);
    }

    if let Some(policy) = input.session_policy.as_ref() {
        if let Some(policy_prompt) = build_session_policy_prompt(policy) {
            blocks.push(policy_prompt);
        }
    }

    Ok(blocks.join("\n\n---\n\n"))
}

fn build_communication_rules(extra_rules: &[String]) -> String {
    let mut lines = vec![
        "## Communication Rules".to_string(),
        String::new(),
        "1. Reply in the same language the user uses. Be concise, accurate, and friendly.".to_string(),
        "2. Do not act unless the user has clearly asked you to. Answering questions, explaining, and analyzing do not require action — stop before reaching for tools.".to_string(),
    ];

    for (index, rule) in extra_rules.iter().enumerate() {
        lines.push(format!("{}. {}", index + 3, rule.trim()));
    }

    lines.join("\n")
}

fn build_user_skills_section(agent_mode: AgentPromptMode) -> String {
    let can_write_skills = !matches!(agent_mode, AgentPromptMode::Plan | AgentPromptMode::Ask);
    let mut lines = vec![
        "## User skills".to_string(),
        String::new(),
        "Custom user skills must be enabled by the user before they become available.".to_string(),
        "They are NOT included in this prompt by default.".to_string(),
        "- Call list_skills to browse enabled user skills (slug, name, description).".to_string(),
        "- Call read_skill with a slug to load full instructions before following them.".to_string(),
    ];

    if can_write_skills {
        lines.push("- Call create_skill to persist new custom skills when the user wants reusable instructions.".to_string());
        lines.push("- Call update_skill to modify an existing user skill (name, description, or content).".to_string());
    }

    lines.push("- New skills are disabled until the user enables them on the Skills page.".to_string());
    lines.push("- The user may also reference an enabled user skill via /slug in their message.".to_string());

    lines.join("\n")
}

fn build_project_instructions_section(content: &str, truncated: bool) -> String {
    let mut lines = vec![
        "## Project instructions (AGENTS.md)".to_string(),
        String::new(),
        "Follow these project-specific rules when they do not conflict with the user's current message.".to_string(),
        content.trim_end().to_string(),
    ];

    if truncated {
        lines.push(String::new());
        lines.push(
            "Note: AGENTS.md was truncated to 32 KB. Use read_file on AGENTS.md to read the full file if needed.".to_string(),
        );
    }

    lines.join("\n")
}

fn build_mode_guidance(agent_mode: AgentPromptMode, workspace_line: &str) -> Option<String> {
    match agent_mode {
        AgentPromptMode::Ask => Some(
            [
                "## Mode Guidance",
                "",
                "You are in Ask mode — you can only read files, search, and browse.",
                "When the user asks you to modify files, run commands, or perform any write operation:",
                "  - Explain that the task requires write access.",
                "  - Tell the user they can switch to Agent mode (click \"Agent\" next to the input) to give you full tool access.",
                "Do NOT silently refuse or just say \"I can't do that.\" Always provide a clear path forward.",
            ]
            .join("\n"),
        ),
        AgentPromptMode::Plan => Some(build_plan_mode_guidance(workspace_line)),
        AgentPromptMode::Agent => None,
    }
}

fn build_plan_mode_guidance(workspace_line: &str) -> String {
    let mut lines = vec![
        "## Mode Guidance".to_string(),
        String::new(),
        "You are in Plan mode — research, analyze, and write a structured Markdown plan to the .plan/ directory.".to_string(),
        "The plan file is the source of truth. The user reviews it in the right panel Plan tab.".to_string(),
        String::new(),
        "### Plan file workflow".to_string(),
        String::new(),
        "- Before creating or revising, call plan_list (and plan_read when needed) to inspect existing plans.".to_string(),
        "- Use plan_create only for a new topic with a new filename. It fails if the file already exists.".to_string(),
        "- Use plan_edit for targeted changes to an existing plan (search-and-replace). Prefer this over plan_update for small edits, appending steps, or revising specific sections.".to_string(),
        "- Use plan_update for major rewrites where you need to replace the entire plan content. For localized changes, use plan_edit instead.".to_string(),
        "- When the user asks to change the current plan, update that plan file; do not create a duplicate.".to_string(),
        "- Use plan_delete only when the user explicitly asks to remove an obsolete plan.".to_string(),
    ];

    if workspace_line == "not selected" {
        lines.push(String::new());
        lines.push("### Workspace required".to_string());
        lines.push(String::new());
        lines.push("- plan_create/plan_update/plan_edit require a selected workspace. Ask the user to select one if plan file tools fail.".to_string());
    }

    lines.join("\n")
}

fn format_today() -> String {
    Local::now().format("%Y-%m-%d, %A %:z").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_agent_prompt_with_environment_block() {
        let prompt = build_system_prompt(BuildSystemPromptInput {
            workspace_dir: None,
            agent_mode: AgentPromptMode::Agent,
            extra_communication_rules: vec![],
            session_policy: None,
        })
        .expect("prompt");

        assert!(prompt.contains("## Environment"));
        assert!(prompt.contains("## Communication Rules"));
        assert!(prompt.contains("## User skills"));
        assert!(prompt.contains("agent (full tool access)"));
    }

    #[test]
    fn ask_mode_includes_mode_guidance() {
        let prompt = build_system_prompt(BuildSystemPromptInput {
            workspace_dir: None,
            agent_mode: AgentPromptMode::Ask,
            extra_communication_rules: vec![],
            session_policy: None,
        })
        .expect("prompt");

        assert!(prompt.contains("## Mode Guidance"));
        assert!(prompt.contains("Ask mode"));
    }
}
