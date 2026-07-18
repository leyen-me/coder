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
    if diff.len() > 20_000 {
        format!(
            "{}... [truncated at 20k chars, total {} chars]",
            &diff[..20_000],
            diff.len()
        )
    } else {
        diff
    }
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
