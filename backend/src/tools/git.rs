use std::path::Path;
use std::process::Command;

/// Returns the current Git branch name for the given workspace directory.
/// Returns `null` when the directory is not a Git repository or Git is not installed.
pub fn git_current_branch(workspace_dir: String) -> Result<Option<String>, String> {
    let trimmed = workspace_dir.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let git_dir = Path::new(trimmed).join(".git");
    if !git_dir.exists() {
        return Ok(None);
    }

    let output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(trimmed)
        .output()
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if !output.status.success() {
        return Ok(None);
    }

    let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if branch.is_empty() || branch == "HEAD" {
        // Detached HEAD or empty result
        return Ok(None);
    }

    Ok(Some(branch))
}
