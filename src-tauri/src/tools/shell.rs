use std::path::Path;
use std::time::Instant;

use serde::{Deserialize, Serialize};

use super::runtime::resolve_shell_for_command;
#[cfg(not(target_os = "windows"))]
use super::workspace_path::resolve_workspace_path;
#[cfg(target_os = "windows")]
use super::workspace_path::resolve_workspace_path_for_shell;

pub const DEFAULT_BLOCK_UNTIL_MS: u64 = 30_000;
pub const MAX_BLOCK_UNTIL_MS: u64 = 600_000;
pub const MAX_STREAM_BYTES_FOR_LLM: usize = 64 * 1024;
pub const MAX_TAIL_LINES: usize = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ShellStatus {
    Running,
    Completed,
    Failed,
    Timeout,
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ShellStatusFilter {
    Running,
    Completed,
    Failed,
    Timeout,
    Cancelled,
    All,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellOutput {
    pub command: String,
    pub description: Option<String>,
    pub working_directory: String,
    pub stdout: String,
    pub stderr: String,
    pub stdout_truncated: bool,
    pub stderr_truncated: bool,
    pub stdout_total_bytes: u64,
    pub stderr_total_bytes: u64,
    pub exit_code: Option<i32>,
    pub duration_ms: u64,
    pub status: ShellStatus,
    pub shell_id: Option<String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellOutputEvent {
    pub shell_id: String,
    pub stream: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadShellLogsResponse {
    pub shell_id: String,
    pub stream: String,
    pub data: String,
    pub offset: usize,
    pub total_bytes: usize,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellInfo {
    pub shell_id: String,
    pub command: String,
    pub description: Option<String>,
    pub working_directory: String,
    pub status: ShellStatus,
    pub exit_code: Option<i32>,
    pub started_at_ms: u64,
    pub task_id: Option<String>,
    pub stdout: String,
    pub stderr: String,
    pub source: String,
}

pub fn normalize_block_until_ms(block_until_ms: Option<u64>) -> u64 {
    block_until_ms
        .unwrap_or(DEFAULT_BLOCK_UNTIL_MS)
        .min(MAX_BLOCK_UNTIL_MS)
}

pub fn resolve_working_directory(
    workspace_dir: &str,
    working_directory: Option<&str>,
) -> Result<std::path::PathBuf, String> {
    let workspace = Path::new(workspace_dir.trim());
    if workspace_dir.trim().is_empty() || !workspace.is_dir() {
        return Err("workspaceDir is required".to_string());
    }

    let raw = working_directory
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(".");

    #[cfg(target_os = "windows")]
    {
        resolve_workspace_path_for_shell(workspace, raw)
    }
    #[cfg(not(target_os = "windows"))]
    {
        resolve_workspace_path(workspace, raw)
    }
}

pub fn truncate_stream_for_llm(raw: &str) -> (String, bool, u64) {
    let total_bytes = raw.len() as u64;
    if raw.len() <= MAX_STREAM_BYTES_FOR_LLM {
        return (raw.to_string(), false, total_bytes);
    }

    let tail = tail_lines(raw, MAX_TAIL_LINES);
    let truncated_marker =
        format!("...[{total_bytes} bytes truncated, showing last {MAX_TAIL_LINES} lines]...\n");
    let mut candidate = format!("{truncated_marker}{tail}");

    if candidate.len() > MAX_STREAM_BYTES_FOR_LLM {
        let keep_from = candidate.len().saturating_sub(MAX_STREAM_BYTES_FOR_LLM);
        candidate = candidate[keep_from..].to_string();
    }

    (candidate, true, total_bytes)
}

fn tail_lines(text: &str, max_lines: usize) -> String {
    let lines: Vec<&str> = text.lines().collect();
    if lines.len() <= max_lines {
        return text.to_string();
    }
    lines[lines.len() - max_lines..].join("\n")
}

pub fn build_shell_output(
    command: String,
    description: Option<String>,
    working_directory: String,
    stdout_raw: &str,
    stderr_raw: &str,
    exit_code: Option<i32>,
    started_at: Instant,
    status: ShellStatus,
    shell_id: Option<String>,
    source: String,
) -> ShellOutput {
    let (stdout, stdout_truncated, stdout_total_bytes) = truncate_stream_for_llm(stdout_raw);
    let (stderr, stderr_truncated, stderr_total_bytes) = truncate_stream_for_llm(stderr_raw);

    ShellOutput {
        command,
        description,
        working_directory,
        stdout,
        stderr,
        stdout_truncated,
        stderr_truncated,
        stdout_total_bytes,
        stderr_total_bytes,
        exit_code,
        duration_ms: started_at.elapsed().as_millis() as u64,
        status,
        shell_id,
        source,
    }
}

pub fn shell_command_builder(shell: &str, command: &str) -> (String, Vec<String>) {
    if cfg!(target_os = "windows") {
        (
            "cmd".to_string(),
            vec!["/C".to_string(), command.to_string()],
        )
    } else {
        (
            shell.to_string(),
            vec!["-c".to_string(), command.to_string()],
        )
    }
}

pub fn resolve_command_shell() -> String {
    resolve_shell_for_command()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncates_long_output_from_tail() {
        let raw = (0..5000)
            .map(|index| format!("line-{index}-{}", "x".repeat(40)))
            .collect::<Vec<_>>()
            .join("\n");
        let (truncated, was_truncated, total_bytes) = truncate_stream_for_llm(&raw);
        assert!(was_truncated);
        assert!(total_bytes > MAX_STREAM_BYTES_FOR_LLM as u64);
        assert!(truncated.contains("line-4999"));
        assert!(truncated.contains("bytes truncated"));
    }

    #[test]
    fn keeps_short_output() {
        let raw = "hello\nworld";
        let (truncated, was_truncated, total_bytes) = truncate_stream_for_llm(raw);
        assert!(!was_truncated);
        assert_eq!(truncated, raw);
        assert_eq!(total_bytes, raw.len() as u64);
    }

    #[test]
    fn clamps_block_until_ms() {
        assert_eq!(normalize_block_until_ms(None), DEFAULT_BLOCK_UNTIL_MS);
        assert_eq!(normalize_block_until_ms(Some(1_000)), 1_000);
        assert_eq!(
            normalize_block_until_ms(Some(MAX_BLOCK_UNTIL_MS + 1)),
            MAX_BLOCK_UNTIL_MS
        );
    }
}
