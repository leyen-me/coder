use std::path::Path;
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchesResponse {
    pub current_branch: Option<String>,
    pub branches: Vec<String>,
}

fn validate_git_workspace(workspace_dir: &str) -> Result<&Path, String> {
    let trimmed = workspace_dir.trim();
    if trimmed.is_empty() {
        return Err("workspaceDir is required".to_string());
    }

    let path = Path::new(trimmed);
    if !path.is_dir() {
        return Err(format!("Workspace not found: {trimmed}"));
    }
    if !path.join(".git").exists() {
        return Err("Workspace is not a git repository".to_string());
    }

    Ok(path)
}

fn run_git(workspace: &Path, args: &[&str]) -> Result<std::process::Output, String> {
    let mut cmd = Command::new("git");
    cmd.current_dir(workspace).args(args);

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    cmd.output()
        .map_err(|error| format!("Failed to run git: {error}"))
}

fn git_success(output: std::process::Output, action: &str) -> Result<String, String> {
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        Err(format!("Git {action} failed"))
    } else {
        Err(stderr)
    }
}

fn read_current_branch(workspace: &Path) -> Result<Option<String>, String> {
    let output = run_git(workspace, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    let branch = git_success(output, "resolve current branch")?;
    if branch.is_empty() || branch == "HEAD" {
        return Ok(None);
    }
    Ok(Some(branch))
}

#[tauri::command]
pub fn git_list_branches(workspace_dir: String) -> Result<GitBranchesResponse, String> {
    let workspace = validate_git_workspace(&workspace_dir)?;
    let current = read_current_branch(workspace).ok().flatten();

    let output = run_git(workspace, &["branch", "--format=%(refname:short)"])?;
    let stdout = git_success(output, "list branches")?;
    let mut branches: Vec<String> = stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect();
    branches.sort_by(|left, right| left.to_lowercase().cmp(&right.to_lowercase()));
    branches.dedup();

    Ok(GitBranchesResponse {
        current_branch: current,
        branches,
    })
}

#[tauri::command]
pub fn git_get_current_branch(workspace_dir: String) -> Result<Option<String>, String> {
    let workspace = validate_git_workspace(&workspace_dir)?;
    read_current_branch(workspace)
}

#[tauri::command]
pub fn git_checkout_branch(workspace_dir: String, branch: String) -> Result<(), String> {
    let workspace = validate_git_workspace(&workspace_dir)?;
    let trimmed = branch.trim();
    if trimmed.is_empty() {
        return Err("Branch name is required".to_string());
    }

    let output = run_git(workspace, &["checkout", trimmed])?;
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        Err(format!("Failed to checkout branch: {trimmed}"))
    } else {
        Err(stderr)
    }
}

#[cfg(test)]
mod tests {
    use super::validate_git_workspace;
    use std::fs;

    #[test]
    fn rejects_missing_workspace() {
        let error = validate_git_workspace("   ").expect_err("empty workspace");
        assert!(error.contains("required"));
    }

    #[test]
    fn rejects_non_git_directory() {
        let temp = std::env::temp_dir().join(format!(
            "coder-git-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&temp).expect("create temp dir");
        let error =
            validate_git_workspace(temp.to_string_lossy().as_ref()).expect_err("non-git dir");
        assert!(error.contains("not a git repository"));
        let _ = fs::remove_dir_all(temp);
    }
}
