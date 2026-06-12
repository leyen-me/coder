use std::path::Path;
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchesResponse {
    pub current_branch: Option<String>,
    pub branches: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum GitFileStatus {
    Modified,
    Added,
    Deleted,
    Renamed,
    Copied,
    Untracked,
    Conflicted,
    TypeChanged,
}

impl GitFileStatus {
    fn from_porcelain_code(x: char, y: char) -> Self {
        match (x, y) {
            ('?', '?') => Self::Untracked,
            ('U', _) | (_, 'U') => Self::Conflicted,
            ('A', _) => Self::Added,
            ('D', _) | (_, 'D') => Self::Deleted,
            ('R', _) | (_, 'R') => Self::Renamed,
            ('C', _) => Self::Copied,
            ('T', _) => Self::TypeChanged,
            ('M', _) | (_, 'M') => Self::Modified,
            _ => Self::Modified,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusEntry {
    pub path: String,
    pub staged: bool,
    pub status: GitFileStatus,
    /// Original path for renamed/copied entries.
    pub original_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitEntry {
    pub hash: String,
    pub author_name: String,
    pub author_email: String,
    pub message: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStashEntry {
    pub index: i32,
    pub message: String,
    pub hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResponse {
    pub entries: Vec<GitStatusEntry>,
    pub current_branch: Option<String>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/// Check if there are uncommitted changes so we can warn before branch switch, etc.
fn has_uncommitted_changes(workspace: &Path) -> bool {
    let Ok(output) = run_git(workspace, &["status", "--porcelain"]) else {
        return false;
    };
    let stdout = String::from_utf8_lossy(&output.stdout);
    !stdout.trim().is_empty()
}

/// Parse a single line from `git status --porcelain`.
/// Returns some entries (possibly two: staged + unstaged for the same path).
fn parse_porcelain_line(line: &str) -> Vec<GitStatusEntry> {
    if line.is_empty() {
        return vec![];
    }

    // Untracked: "?? path"
    if let Some(rest) = line.strip_prefix("??") {
        let path = rest.trim();
        return vec![GitStatusEntry {
            path: path.to_string(),
            staged: false,
            status: GitFileStatus::Untracked,
            original_path: None,
        }];
    }

    // Conflicted: "UU path"
    if let Some(rest) = line.strip_prefix("UU") {
        let path = rest.trim();
        return vec![GitStatusEntry {
            path: path.to_string(),
            staged: false,
            status: GitFileStatus::Conflicted,
            original_path: None,
        }];
    }

    // Normal two-character codes: "XY path" or "XY old_path -> new_path"
    // Do NOT trim the line before extracting codes — " M" means unstaged only.
    let bytes = line.as_bytes();
    if bytes.len() < 2 {
        return vec![];
    }
    let x_code = bytes[0] as char;
    let y_code = bytes[1] as char;
    let rest = line[2..].trim();

    let (path, original_path) = if x_code == 'R' || x_code == 'C' {
        // "R  old\0new" or "R  old -> new" — but porcelain uses null separator
        // Actually `git status --porcelain` uses "R  oldpath -> newpath" in normal mode
        if let Some((old, new)) = rest.split_once(" -> ") {
            (new.trim().to_string(), Some(old.trim().to_string()))
        } else {
            (rest.to_string(), None)
        }
    } else {
        (rest.to_string(), None)
    };

    let mut entries = vec![];

    // Staged change (X code)
    if x_code != ' ' && x_code != '.' {
        entries.push(GitStatusEntry {
            path: path.clone(),
            staged: true,
            status: GitFileStatus::from_porcelain_code(x_code, ' '),
            original_path: original_path.clone(),
        });
    }

    // Unstaged change (Y code)
    if y_code != ' ' && y_code != '.' {
        entries.push(GitStatusEntry {
            path,
            staged: false,
            status: GitFileStatus::from_porcelain_code(' ', y_code),
            original_path,
        });
    }

    entries
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Initialize a git repository in the workspace directory.
#[tauri::command]
pub fn git_init(workspace_dir: String) -> Result<(), String> {
    let trimmed = workspace_dir.trim();
    if trimmed.is_empty() {
        return Err("workspaceDir is required".to_string());
    }

    let path = Path::new(trimmed);
    if !path.is_dir() {
        return Err(format!("Workspace not found: {trimmed}"));
    }
    if path.join(".git").exists() {
        return Err("Workspace is already a git repository".to_string());
    }

    let output = run_git(path, &["init"])?;
    if output.status.success() {
        // Configure default user so subsequent commits work without global config.
        let _ = run_git(path, &["config", "user.email", "coder@local.dev"]);
        let _ = run_git(path, &["config", "user.name", "Coder"]);
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            Err("Failed to initialize git repository".to_string())
        } else {
            Err(stderr)
        }
    }
}

/// Get full file status: staged + unstaged changes.
#[tauri::command]
pub fn git_status(workspace_dir: String) -> Result<GitStatusResponse, String> {
    let workspace = validate_git_workspace(&workspace_dir)?;
    let current_branch = read_current_branch(workspace).ok().flatten();

    let output = run_git(
        workspace,
        &["status", "--porcelain", "-u"],
    )?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return if stderr.is_empty() {
            Err("Git status failed".to_string())
        } else {
            Err(stderr)
        };
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    // NOTE: do NOT trim() — porcelain format preserves meaningful leading spaces

    let mut entries: Vec<GitStatusEntry> = Vec::new();
    for line in stdout.lines() {
        entries.extend(parse_porcelain_line(line));
    }

    Ok(GitStatusResponse {
        entries,
        current_branch,
    })
}

/// Stage (add) specific files. Accepts a list of relative paths.
#[tauri::command]
pub fn git_stage_files(workspace_dir: String, paths: Vec<String>) -> Result<(), String> {
    let workspace = validate_git_workspace(&workspace_dir)?;
    if paths.is_empty() {
        return Err("No files specified to stage".to_string());
    }

    let mut args = vec!["add", "--"];
    for p in &paths {
        args.push(p.as_str());
    }
    let output = run_git(workspace, &args)?;
    git_success(output, "stage files")?;
    Ok(())
}

/// Unstage specific files (resets staged changes but keeps working tree).
#[tauri::command]
pub fn git_unstage_files(workspace_dir: String, paths: Vec<String>) -> Result<(), String> {
    let workspace = validate_git_workspace(&workspace_dir)?;
    if paths.is_empty() {
        return Err("No files specified to unstage".to_string());
    }

    // `git restore --staged -- file1 file2`
    let mut args = vec!["restore", "--staged", "--"];
    for p in &paths {
        args.push(p.as_str());
    }
    let output = run_git(workspace, &args)?;
    git_success(output, "unstage files")?;
    Ok(())
}

/// Stage all changes (equivalent to `git add -A`).
#[tauri::command]
pub fn git_stage_all(workspace_dir: String) -> Result<(), String> {
    let workspace = validate_git_workspace(&workspace_dir)?;
    let output = run_git(workspace, &["add", "-A"])?;
    git_success(output, "stage all")?;
    Ok(())
}

/// Unstage all changes (equivalent to `git reset`).
#[tauri::command]
pub fn git_unstage_all(workspace_dir: String) -> Result<(), String> {
    let workspace = validate_git_workspace(&workspace_dir)?;
    let output = run_git(workspace, &["reset"])?;
    git_success(output, "unstage all")?;
    Ok(())
}

/// Create a commit with the given message.
#[tauri::command]
pub fn git_commit(workspace_dir: String, message: String) -> Result<(), String> {
    let workspace = validate_git_workspace(&workspace_dir)?;
    if message.trim().is_empty() {
        return Err("Commit message cannot be empty".to_string());
    }

    let output = run_git(workspace, &["commit", "-m", message.trim()])?;
    git_success(output, "commit")?;
    Ok(())
}

/// Get commit log.
/// `max_count` defaults to 50 if not provided or 0.
/// `skip` defaults to 0 when not provided.
#[tauri::command]
pub fn git_log(
    workspace_dir: String,
    max_count: Option<u32>,
    skip: Option<u32>,
) -> Result<Vec<GitCommitEntry>, String> {
    let workspace = validate_git_workspace(&workspace_dir)?;
    let count = max_count.filter(|&c| c > 0).unwrap_or(50);
    let skip = skip.unwrap_or(0);

    let output = run_git(
        workspace,
        &[
            "log",
            &format!("--max-count={count}"),
            &format!("--skip={skip}"),
            "--format=%H%n%an%n%ae%n%ct%n%s%n---",
            "--no-color",
        ],
    )?;
    let stdout = git_success(output, "log")?;

    // Remove trailing separator that comes from the final block
    let stdout = stdout.trim_end_matches("---").trim();
    if stdout.is_empty() {
        return Ok(vec![]);
    }

    let mut entries: Vec<GitCommitEntry> = Vec::new();
    for block in stdout.split("\n---\n") {
        let block = block.trim();
        if block.is_empty() {
            continue;
        }
        let lines: Vec<&str> = block.splitn(5, '\n').collect();
        if lines.len() < 5 {
            continue;
        }

        let hash = lines[0].trim().to_string();
        let author_name = lines[1].trim().to_string();
        let author_email = lines[2].trim().to_string();
        let timestamp: i64 = lines[3].trim().parse().unwrap_or(0);
        let message = lines[4].trim().to_string();

        entries.push(GitCommitEntry {
            hash,
            author_name,
            author_email,
            message,
            timestamp,
        });
    }

    Ok(entries)
}

/// Get diff for a working-tree file vs HEAD (unstaged changes).
/// If `staged` is true, get staged diff instead.
#[tauri::command]
pub fn git_diff(
    workspace_dir: String,
    file_path: String,
    staged: Option<bool>,
) -> Result<String, String> {
    let workspace = validate_git_workspace(&workspace_dir)?;
    let is_staged = staged.unwrap_or(false);

    let args: &[&str] = if is_staged {
        &["diff", "--staged", "--", file_path.as_str()]
    } else {
        &["diff", "--", file_path.as_str()]
    };

    let output = run_git(workspace, args)?;
    let diff = git_success(output, "diff")?;
    Ok(diff)
}

/// List all local branches.
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

/// Get current branch name.
#[tauri::command]
pub fn git_get_current_branch(workspace_dir: String) -> Result<Option<String>, String> {
    let workspace = validate_git_workspace(&workspace_dir)?;
    read_current_branch(workspace)
}

/// Switch to an existing branch.
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

/// Create a new branch (from HEAD).
#[tauri::command]
pub fn git_create_branch(workspace_dir: String, name: String) -> Result<(), String> {
    let workspace = validate_git_workspace(&workspace_dir)?;
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Branch name is required".to_string());
    }

    let output = run_git(workspace, &["branch", trimmed])?;
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        Err(format!("Failed to create branch: {trimmed}"))
    } else {
        Err(stderr)
    }
}

/// Delete a branch (safe: refuses if unmerged).
#[tauri::command]
pub fn git_delete_branch(workspace_dir: String, name: String) -> Result<(), String> {
    let workspace = validate_git_workspace(&workspace_dir)?;
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Branch name is required".to_string());
    }

    let output = run_git(workspace, &["branch", "-d", trimmed])?;
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        Err(format!("Failed to delete branch: {trimmed}"))
    } else {
        Err(stderr)
    }
}

/// Force-delete a branch (even if unmerged).
#[tauri::command]
pub fn git_delete_branch_force(workspace_dir: String, name: String) -> Result<(), String> {
    let workspace = validate_git_workspace(&workspace_dir)?;
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Branch name is required".to_string());
    }

    let output = run_git(workspace, &["branch", "-D", trimmed])?;
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        Err(format!("Failed to delete branch: {trimmed}"))
    } else {
        Err(stderr)
    }
}

// ---------------------------------------------------------------------------
// Remote operations
// ---------------------------------------------------------------------------

/// Push to remote.
#[tauri::command]
pub fn git_push(
    workspace_dir: String,
    remote: Option<String>,
    branch: Option<String>,
) -> Result<String, String> {
    let workspace = validate_git_workspace(&workspace_dir)?;
    let remote = remote.unwrap_or_else(|| "origin".to_string());
    let branch = branch.unwrap_or_else(|| "HEAD".to_string());

    let output = run_git(workspace, &["push", &remote, &branch])?;
    let result = git_success(output, "push")?;
    Ok(result)
}

/// Pull from remote.
#[tauri::command]
pub fn git_pull(
    workspace_dir: String,
    remote: Option<String>,
    branch: Option<String>,
) -> Result<String, String> {
    let workspace = validate_git_workspace(&workspace_dir)?;
    let remote = remote.unwrap_or_else(|| "origin".to_string());

    let args: &[&str] = if let Some(ref b) = branch {
        &["pull", "--no-rebase", &remote, b.as_str()]
    } else {
        &["pull", "--no-rebase", &remote]
    };

    let output = run_git(workspace, args)?;
    let result = git_success(output, "pull")?;
    Ok(result)
}

/// Fetch from remote.
#[tauri::command]
pub fn git_fetch(workspace_dir: String, remote: Option<String>) -> Result<String, String> {
    let workspace = validate_git_workspace(&workspace_dir)?;
    let remote = remote.unwrap_or_else(|| "origin".to_string());

    let output = run_git(workspace, &["fetch", &remote])?;
    let result = git_success(output, "fetch")?;
    Ok(result)
}

/// Get the remote URL (origin, or specified remote).
#[tauri::command]
pub fn git_get_remote_url(
    workspace_dir: String,
    remote: Option<String>,
) -> Result<Option<String>, String> {
    let workspace = validate_git_workspace(&workspace_dir)?;
    let remote = remote.unwrap_or_else(|| "origin".to_string());

    let output = run_git(workspace, &["remote", "get-url", &remote])?;
    if output.status.success() {
        let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(Some(url))
    } else {
        Ok(None)
    }
}

// ---------------------------------------------------------------------------
// Stash operations
// ---------------------------------------------------------------------------

/// List all stashes.
#[tauri::command]
pub fn git_stash_list(workspace_dir: String) -> Result<Vec<GitStashEntry>, String> {
    let workspace = validate_git_workspace(&workspace_dir)?;

    let output = run_git(
        workspace,
        &["stash", "list", "--format=%H%n%gd%n%s%n---"],
    )?;
    let stdout = git_success(output, "stash list")?;

    // Remove trailing separator
    let stdout = stdout.trim_end_matches("---").trim();
    if stdout.is_empty() {
        return Ok(vec![]);
    }

    let mut entries: Vec<GitStashEntry> = Vec::new();
    for block in stdout.split("\n---\n") {
        let block = block.trim();
        if block.is_empty() {
            continue;
        }
        let lines: Vec<&str> = block.splitn(3, '\n').collect();
        if lines.len() < 3 {
            continue;
        }

        let hash = lines[0].trim().to_string();
        let ref_str = lines[1].trim();
        // Parse index from ref like "stash@{0}"
        let index = ref_str
            .strip_prefix("stash@{")
            .and_then(|s| s.strip_suffix('}'))
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        let message = lines[2].trim().to_string();

        entries.push(GitStashEntry {
            index,
            message,
            hash,
        });
    }

    Ok(entries)
}

/// Push working changes onto the stash.
/// `message` is optional.
#[tauri::command]
pub fn git_stash_push(
    workspace_dir: String,
    message: Option<String>,
) -> Result<(), String> {
    let workspace = validate_git_workspace(&workspace_dir)?;

    let output = if let Some(msg) = message {
        let trimmed = msg.trim();
        if trimmed.is_empty() {
            run_git(workspace, &["stash", "push"])?
        } else {
            run_git(workspace, &["stash", "push", "-m", trimmed])?
        }
    } else {
        run_git(workspace, &["stash", "push"])?
    };

    git_success(output, "stash push")?;
    Ok(())
}

/// Pop (apply and drop) the latest stash.
/// If `index` is provided, pop that specific stash.
#[tauri::command]
pub fn git_stash_pop(workspace_dir: String, index: Option<i32>) -> Result<(), String> {
    let workspace = validate_git_workspace(&workspace_dir)?;

    let output = if let Some(idx) = index {
        run_git(workspace, &["stash", "pop", &format!("stash@{{{idx}}}")])?
    } else {
        run_git(workspace, &["stash", "pop"])?
    };

    git_success(output, "stash pop")?;
    Ok(())
}

/// Drop a stash by index (or latest if not specified).
#[tauri::command]
pub fn git_stash_drop(workspace_dir: String, index: Option<i32>) -> Result<(), String> {
    let workspace = validate_git_workspace(&workspace_dir)?;

    let output = if let Some(idx) = index {
        run_git(workspace, &["stash", "drop", &format!("stash@{{{idx}}}")])?
    } else {
        run_git(workspace, &["stash", "drop"])?
    };

    git_success(output, "stash drop")?;
    Ok(())
}

/// Apply stash without dropping.
#[tauri::command]
pub fn git_stash_apply(workspace_dir: String, index: Option<i32>) -> Result<(), String> {
    let workspace = validate_git_workspace(&workspace_dir)?;

    let output = if let Some(idx) = index {
        run_git(workspace, &["stash", "apply", &format!("stash@{{{idx}}}")])?
    } else {
        run_git(workspace, &["stash", "apply"])?
    };

    git_success(output, "stash apply")?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_git_dir() -> std::path::PathBuf {
        use std::sync::atomic::{AtomicU32, Ordering};
        static COUNTER: AtomicU32 = AtomicU32::new(0);
        let id = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "coder-git-test-{id}-{ts}",
            ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&dir).expect("create temp dir");
        // Init git repo
        let status = Command::new("git")
            .arg("init")
            .current_dir(&dir)
            .status()
            .expect("git init");
        assert!(status.success());

        // Configure minimal user so commits work
        Command::new("git")
            .args(["config", "user.email", "test@coder.dev"])
            .current_dir(&dir)
            .status()
            .expect("git config email");
        Command::new("git")
            .args(["config", "user.name", "Coder Test"])
            .current_dir(&dir)
            .status()
            .expect("git config name");

        dir
    }

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

    #[test]
    fn parse_untracked_file() {
        let entries = parse_porcelain_line("?? src/main.rs");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].path, "src/main.rs");
        assert!(!entries[0].staged);
        assert_eq!(entries[0].status, GitFileStatus::Untracked);
    }

    #[test]
    fn parse_modified_staged() {
        let entries = parse_porcelain_line("M  src/main.rs");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].path, "src/main.rs");
        assert!(entries[0].staged);
        assert_eq!(entries[0].status, GitFileStatus::Modified);
    }

    #[test]
    fn parse_modified_unstaged() {
        let entries = parse_porcelain_line(" M src/main.rs");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].path, "src/main.rs");
        assert!(!entries[0].staged);
        assert_eq!(entries[0].status, GitFileStatus::Modified);
    }

    #[test]
    fn parse_modified_both() {
        let entries = parse_porcelain_line("MM src/main.rs");
        assert_eq!(entries.len(), 2);
        assert!(entries[0].staged);
        assert!(!entries[1].staged);
    }

    #[test]
    fn parse_added_staged() {
        let entries = parse_porcelain_line("A  new_file.rs");
        assert_eq!(entries[0].status, GitFileStatus::Added);
    }

    #[test]
    fn parse_deleted() {
        let entries = parse_porcelain_line(" D old_file.rs");
        assert_eq!(entries[0].status, GitFileStatus::Deleted);
    }

    #[test]
    fn parse_conflicted() {
        let entries = parse_porcelain_line("UU conflicted.rs");
        assert_eq!(entries[0].status, GitFileStatus::Conflicted);
    }

    #[test]
    fn status_returns_entries() {
        let dir = temp_git_dir();
        let dir_str = dir.to_string_lossy().to_string();

        // Create an initial commit
        fs::write(dir.join("initial.txt"), "hello").expect("write initial");
        Command::new("git")
            .args(["add", "-A"])
            .current_dir(&dir)
            .status()
            .expect("git add");
        Command::new("git")
            .args(["commit", "-m", "initial"])
            .current_dir(&dir)
            .status()
            .expect("git commit");

        // Create untracked file
        fs::write(dir.join("untracked.txt"), "new").expect("write untracked");

        // Modify existing file
        fs::write(dir.join("initial.txt"), "modified").expect("write modified");

        let response = git_status(dir_str).expect("git_status");
        assert!(!response.entries.is_empty());

        let untracked = response
            .entries
            .iter()
            .find(|e| e.status == GitFileStatus::Untracked);
        assert!(untracked.is_some());
        assert_eq!(untracked.unwrap().path, "untracked.txt");

        let modified = response
            .entries
            .iter()
            .find(|e| e.status == GitFileStatus::Modified && !e.staged);
        assert!(modified.is_some());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn commit_creates_history() {
        let dir = temp_git_dir();
        let dir_str = dir.to_string_lossy().to_string();

        fs::write(dir.join("file.txt"), "content").expect("write");
        Command::new("git")
            .args(["add", "-A"])
            .current_dir(&dir)
            .status()
            .expect("git add");
        Command::new("git")
            .args(["commit", "-m", "first commit"])
            .current_dir(&dir)
            .status()
            .expect("git commit");

        let log = git_log(dir_str, Some(10), None).expect("git_log");
        assert!(!log.is_empty());
        assert_eq!(log[0].message, "first commit");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn commit_history_supports_pagination() {
        let dir = temp_git_dir();
        let dir_str = dir.to_string_lossy().to_string();

        for index in 0..3 {
            fs::write(dir.join("file.txt"), format!("content-{index}")).expect("write");
            Command::new("git")
                .args(["add", "-A"])
                .current_dir(&dir)
                .status()
                .expect("git add");
            Command::new("git")
                .args(["commit", "-m", &format!("commit-{index}")])
                .current_dir(&dir)
                .status()
                .expect("git commit");
        }

        let first_page = git_log(dir_str.clone(), Some(2), Some(0)).expect("git_log first page");
        let second_page = git_log(dir_str.clone(), Some(2), Some(2)).expect("git_log second page");

        assert_eq!(first_page.len(), 2);
        assert_eq!(second_page.len(), 1);
        assert_eq!(first_page[0].message, "commit-2");
        assert_eq!(first_page[1].message, "commit-1");
        assert_eq!(second_page[0].message, "commit-0");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn stage_and_unstage_files() {
        let dir = temp_git_dir();
        let dir_str = dir.to_string_lossy().to_string();

        fs::write(dir.join("initial.txt"), "hello").expect("write");
        Command::new("git")
            .args(["add", "-A"])
            .current_dir(&dir)
            .status()
            .expect("git add");
        Command::new("git")
            .args(["commit", "-m", "initial"])
            .current_dir(&dir)
            .status()
            .expect("git commit");

        // Modify file
        fs::write(dir.join("initial.txt"), "modified").expect("write");

        // Stage it
        git_stage_files(dir_str.clone(), vec!["initial.txt".to_string()])
            .expect("stage files");

        let response = git_status(dir_str.clone()).expect("status");
        let staged = response
            .entries
            .iter()
            .find(|e| e.path == "initial.txt" && e.staged);
        assert!(staged.is_some());
        assert_eq!(staged.unwrap().status, GitFileStatus::Modified);

        // Unstage it
        git_unstage_files(dir_str.clone(), vec!["initial.txt".to_string()])
            .expect("unstage files");

        let response = git_status(dir_str).expect("status");
        let still_staged = response
            .entries
            .iter()
            .find(|e| e.path == "initial.txt" && e.staged);
        assert!(still_staged.is_none());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn stage_all_and_unstage_all() {
        let dir = temp_git_dir();
        let dir_str = dir.to_string_lossy().to_string();

        fs::write(dir.join("initial.txt"), "hello").expect("write");
        Command::new("git")
            .args(["add", "-A"])
            .current_dir(&dir)
            .status()
            .expect("git add");
        Command::new("git")
            .args(["commit", "-m", "initial"])
            .current_dir(&dir)
            .status()
            .expect("git commit");

        // Create and modify files
        fs::write(dir.join("a.txt"), "a").expect("write");
        fs::write(dir.join("initial.txt"), "modified").expect("write");

        git_stage_all(dir_str.clone()).expect("stage all");

        let response = git_status(dir_str.clone()).expect("status");
        let staged_count = response.entries.iter().filter(|e| e.staged).count();
        assert!(staged_count > 0);

        git_unstage_all(dir_str.clone()).expect("unstage all");

        let response = git_status(dir_str).expect("status");
        let staged_after = response.entries.iter().filter(|e| e.staged).count();
        assert_eq!(staged_after, 0);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn branch_operations() {
        let dir = temp_git_dir();
        let dir_str = dir.to_string_lossy().to_string();

        fs::write(dir.join("file.txt"), "content").expect("write");
        Command::new("git")
            .args(["add", "-A"])
            .current_dir(&dir)
            .status()
            .expect("git add");
        Command::new("git")
            .args(["commit", "-m", "initial"])
            .current_dir(&dir)
            .status()
            .expect("git commit");

        // Create branch
        git_create_branch(dir_str.clone(), "feature".to_string()).expect("create branch");

        let branches = git_list_branches(dir_str.clone()).expect("list branches");
        assert!(branches.branches.contains(&"feature".to_string()));

        // Checkout
        git_checkout_branch(dir_str.clone(), "feature".to_string()).expect("checkout");
        let current = git_get_current_branch(dir_str.clone()).expect("current branch");
        assert_eq!(current, Some("feature".to_string()));

        // Delete
        git_checkout_branch(dir_str.clone(), "main".to_string()).expect("checkout main");
        git_delete_branch(dir_str.clone(), "feature".to_string()).expect("delete branch");

        let branches = git_list_branches(dir_str).expect("list branches");
        assert!(!branches.branches.contains(&"feature".to_string()));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn stash_operations() {
        let dir = temp_git_dir();
        let dir_str = dir.to_string_lossy().to_string();

        fs::write(dir.join("file.txt"), "content").expect("write");
        Command::new("git")
            .args(["add", "-A"])
            .current_dir(&dir)
            .status()
            .expect("git add");
        Command::new("git")
            .args(["commit", "-m", "initial"])
            .current_dir(&dir)
            .status()
            .expect("git commit");

        // Modify file
        fs::write(dir.join("file.txt"), "stashed change").expect("write");

        // Stash
        git_stash_push(dir_str.clone(), Some("my stash".to_string())).expect("stash push");

        // Verify working tree is clean
        let response = git_status(dir_str.clone()).expect("status");
        assert!(response.entries.is_empty());

        // List stash — message includes "On <branch>:" prefix
        let stashes = git_stash_list(dir_str.clone()).expect("stash list");
        assert!(!stashes.is_empty());
        assert_eq!(stashes[0].message, "On main: my stash");

        // Pop stash
        git_stash_pop(dir_str.clone(), None).expect("stash pop");

        // Verify changes are back
        let response = git_status(dir_str).expect("status");
        assert!(!response.entries.is_empty());

        let _ = fs::remove_dir_all(&dir);
    }
}
