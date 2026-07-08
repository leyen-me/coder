use std::path::Path;
use std::process::Command;

use serde::Serialize;

use crate::tools::git::git_current_branch;

const MAX_DIFF_CHARS: usize = 65_536;

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
        return Err("workspaceDir is required".to_string());
    }

    let git_dir = Path::new(trimmed).join(".git");
    if !git_dir.exists() {
        return Ok(empty_snapshot());
    }

    Ok(GitSnapshotResult {
        branch: git_current_branch(trimmed.to_string()).unwrap_or(None),
        status_short: git_command(trimmed, &["status", "--short"]),
        diff_stat: git_command(trimmed, &["diff", "--stat"]),
        unstaged_diff: git_command(trimmed, &["diff"]),
        staged_diff: git_command(trimmed, &["diff", "--staged"]),
        recent_log: git_command(trimmed, &["log", "--oneline", "-n", "20"]),
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

fn git_command(working_dir: &str, args: &[&str]) -> String {
    let output = match Command::new("git")
        .args(args)
        .current_dir(working_dir)
        .output()
    {
        Ok(output) => output,
        Err(error) => {
            log::warn!("Failed to run git {:?} in {working_dir}: {error}", args);
            return String::new();
        }
    };

    if !output.status.success() {
        log::warn!(
            "git {:?} exited with {} in {working_dir}",
            args,
            output.status
        );
        return String::new();
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    truncate_text(stdout, MAX_DIFF_CHARS)
}

fn truncate_text(text: String, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text;
    }

    let truncated: String = text.chars().take(max_chars).collect();
    format!("{truncated}\n\n... [truncated]")
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{tool_collect_git_snapshot, truncate_text, MAX_DIFF_CHARS};

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

    #[test]
    fn truncates_large_diff_output() {
        let large = "x".repeat(MAX_DIFF_CHARS + 100);
        let original_len = large.chars().count();
        let truncated = truncate_text(large, MAX_DIFF_CHARS);
        assert!(truncated.contains("... [truncated]"));
        assert!(truncated.chars().count() > MAX_DIFF_CHARS);
        assert!(truncated.chars().count() < original_len);
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
