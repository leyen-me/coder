use std::path::Path;

use serde::Serialize;

use super::project_instructions::{load_workspace_agents_md, AgentsMdContent};
use super::{list_available_skills, SkillRoots, SkillSummary};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeEnvironmentResponse {
    pub os: String,
    pub shell: String,
    pub is_git_repository: bool,
    pub agents_md: Option<AgentsMdContent>,
    pub skill_roots: SkillRoots,
    pub available_skills: Vec<SkillSummary>,
}

pub fn agent_get_runtime_environment(
    workspace_dir: Option<String>,
) -> Result<RuntimeEnvironmentResponse, String> {
    let trimmed_workspace = workspace_dir.as_deref().map(str::trim).unwrap_or("");
    let agents_md = if trimmed_workspace.is_empty() {
        None
    } else {
        load_workspace_agents_md(trimmed_workspace)?
    };
    let skills = list_available_skills(workspace_dir.as_deref())?;

    Ok(RuntimeEnvironmentResponse {
        os: resolve_os(),
        shell: resolve_shell(),
        is_git_repository: workspace_dir
            .as_deref()
            .map(is_git_repository)
            .unwrap_or(false),
        agents_md,
        skill_roots: skills.roots,
        available_skills: skills.skills,
    })
}

fn resolve_os() -> String {
    format!(
        "{} {} ({})",
        std::env::consts::OS,
        std::env::consts::ARCH,
        resolve_os_version()
    )
}

fn resolve_os_version() -> String {
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("sw_vers")
            .arg("-productVersion")
            .output();
        if let Ok(result) = output {
            if result.status.success() {
                return String::from_utf8_lossy(&result.stdout).trim().to_string();
            }
        }
    }

    std::env::consts::OS.to_string()
}

fn resolve_shell() -> String {
    resolve_shell_for_command()
}

pub fn resolve_shell_for_command() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| {
        if cfg!(target_os = "windows") {
            std::env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".to_string())
        } else {
            "/bin/sh".to_string()
        }
    })
}

fn is_git_repository(workspace_dir: &str) -> bool {
    let trimmed = workspace_dir.trim();
    if trimmed.is_empty() {
        return false;
    }

    Path::new(trimmed).join(".git").exists()
}
