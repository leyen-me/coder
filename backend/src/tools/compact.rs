//! Compact tool — manual context compaction via /compact slash command.
//!
//! Provides:
//! 1. `tool_manual_compact` — lets the agent trigger a compact on demand.
//! 2. `tool_collect_git_snapshot` — collects a lightweight git status/diff
//!    snapshot that the compact prompt uses for context.

use serde::{Deserialize, Serialize};
use std::process::Command;

/// Result of collecting a git snapshot for compaction context.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitSnapshotResult {
    pub branch: Option<String>,
    pub status: String,
    pub diff: String,
    pub latest_commit: String,
}

/// Collect a lightweight git snapshot for the compaction context.
pub fn tool_collect_git_snapshot(workspace_dir: &str) -> Result<GitSnapshotResult, String> {
    let branch = git_command(workspace_dir, &["rev-parse", "--abbrev-ref", "HEAD"]);
    let status = git_command(workspace_dir, &["status", "--short", "--branch"])
        .unwrap_or_default();
    let diff = git_command(workspace_dir, &["diff", "--stat", "--patch", "-U3"])
        .unwrap_or_default();
    let latest_commit = git_command(
        workspace_dir,
        &["log", "-1", "--format=%h %s", "--max-count=1"],
    )
    .unwrap_or_default();

    let diff_trimmed = truncate_git_output(diff);

    Ok(GitSnapshotResult {
        branch,
        status,
        diff: diff_trimmed,
        latest_commit,
    })
}

fn truncate_git_output(diff: String) -> String {
    const MAX_BYTES: usize = 20_000;
    if diff.len() <= MAX_BYTES {
        return diff;
    }

    let mut end = MAX_BYTES;
    while end > 0 && !diff.is_char_boundary(end) {
        end -= 1;
    }

    format!(
        "{}... [truncated at {MAX_BYTES} bytes, total {} bytes]",
        &diff[..end],
        diff.len()
    )
}

fn git_command(cwd: &str, args: &[&str]) -> Option<String> {
    Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .ok()
        .and_then(|out| {
            if out.status.success() {
                String::from_utf8(out.stdout).ok()
            } else {
                None
            }
        })
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[cfg(test)]
mod tests {
    use super::truncate_git_output;

    #[test]
    fn truncate_git_output_respects_utf8_char_boundaries() {
        // 20_001 bytes ending mid-codepoint must not panic.
        let prefix = "a".repeat(19_999);
        let diff = format!("{prefix}你");
        assert!(diff.len() > 20_000);
        let truncated = truncate_git_output(diff);
        assert!(truncated.contains("[truncated at 20000 bytes"));
        assert!(truncated.starts_with(&"a".repeat(19_999)));
        assert!(!truncated.contains('你'));
    }
}
