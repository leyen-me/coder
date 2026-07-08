use std::path::Path;
use std::process::Command;

use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSnapshotResult {
    pub branch: Option<String>,
    pub status_short: String,
    pub diff_stat: String,
    pub unstaged_diff: String,
    pub staged_diff: String,
    pub recent_log: String,
}

pub fn tool_collect_git_snapshot(workspace_dir: String) -> Result<GitSnapshotResult, String> {
    let trimmed = workspace_dir.trim();
    if trimmed.is_empty() {
        return Ok(empty_snapshot());
    }

    let git_dir = Path::new(trimmed).join(".git");
    if !git_dir.exists() {
        return Ok(empty_snapshot());
    }

    Ok(GitSnapshotResult {
        branch: git_command(trimmed, &["rev-parse", "--abbrev-ref", "HEAD"])?,
        status_short: git_command(trimmed, &["status", "--short"])?.unwrap_or_default(),
        diff_stat: git_command(trimmed, &["diff", "--stat"])?.unwrap_or_default(),
        unstaged_diff: git_command(trimmed, &["diff"])?.unwrap_or_default(),
        staged_diff: git_command(trimmed, &["diff", "--staged"])?.unwrap_or_default(),
        recent_log: git_command(trimmed, &["log", "--oneline", "-n", "20"])?.unwrap_or_default(),
    })
}

fn empty_snapshot() -> GitSnapshotResult {
    GitSnapshotResult {
        branch: None,
        status_short: String::new(),
        diff_stat: String::new(),
        unstaged_diff: String::new(),
        staged_diff: String::new(),
        recent_log: String::new(),
    }
}

fn git_command(working_dir: &str, args: &[&str]) -> Result<Option<String>, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(working_dir)
        .output()
        .map_err(|error| format!("Failed to run git {:?}: {error}", args))?;

    if !output.status.success() {
        return Ok(None);
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        return Ok(None);
    }

    Ok(Some(stdout))
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::tool_collect_git_snapshot;

    #[test]
    fn returns_empty_snapshot_outside_git_repo() {
        let temp = create_temp_dir("handoff-empty");
        let snapshot =
            tool_collect_git_snapshot(temp.to_string_lossy().to_string()).expect("snapshot");

        assert_eq!(snapshot.branch, None);
        assert!(snapshot.status_short.is_empty());
        assert!(snapshot.diff_stat.is_empty());
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn collects_snapshot_inside_git_repo() {
        let repo = create_temp_dir("handoff-git");
        run_git(&repo, &["init"]);
        run_git(&repo, &["config", "user.email", "test@example.com"]);
        run_git(&repo, &["config", "user.name", "Test User"]);
        fs::write(repo.join("a.txt"), "hello\n").expect("write");
        run_git(&repo, &["add", "a.txt"]);
        run_git(&repo, &["commit", "-m", "init"]);
        fs::write(repo.join("a.txt"), "hello\nworld\n").expect("rewrite");

        let snapshot =
            tool_collect_git_snapshot(repo.to_string_lossy().to_string()).expect("snapshot");

        assert!(snapshot.branch.is_some());
        assert!(snapshot.unstaged_diff.contains("world"));
        assert!(snapshot.recent_log.contains("init"));
        let _ = fs::remove_dir_all(repo);
    }

    fn run_git(repo: &Path, args: &[&str]) {
        let output = Command::new("git")
            .args(args)
            .current_dir(repo)
            .output()
            .expect("git command");
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn create_temp_dir(prefix: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("coder-{prefix}-{unique}"));
        fs::create_dir_all(&path).expect("create temp dir");
        path
    }
}
