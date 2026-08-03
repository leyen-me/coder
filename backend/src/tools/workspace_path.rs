use std::path::{Path, PathBuf};

/// Name of the per-workspace agent data directory.
///
/// Every directory the agent manages inside a workspace (plans, history
/// backups, skills, …) lives below `<workspace>/.coder` so they stay grouped
/// and can be excluded or relocated as a single unit. New agent data dirs
/// should live here too — resolve their path with [`workspace_coder_subdir`].
pub const CODER_DIR_NAME: &str = ".coder";

/// Returns the per-workspace agent data directory: `<workspace>/.coder`.
pub fn workspace_coder_dir(workspace: &Path) -> PathBuf {
    workspace.join(CODER_DIR_NAME)
}

/// Resolves the canonical path for an agent-owned subdirectory inside the
/// workspace: `<workspace>/.coder/<name>`.
///
/// This is the single entry point for every directory the agent creates under
/// the workspace `.coder` tree (plans, history, skills, caches, …). Routing all
/// of them through here keeps them grouped, and because the whole `.coder` tree
/// is already excluded from the workspace file view (`ALWAYS_EXCLUDE`), new
/// subdirs inherit the "hidden from the user's project tree" behavior for free.
pub fn workspace_coder_subdir(workspace: &Path, name: &str) -> PathBuf {
    workspace_coder_dir(workspace).join(name)
}

/// Validates that `path` refers to an existing directory on disk.
pub fn validate_workspace_dir(path: &str) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("workspaceDir is required".to_string());
    }

    let workspace = PathBuf::from(trimmed);
    let canonical = workspace
        .canonicalize()
        .map_err(|error| format!("Invalid workspaceDir: {error}"))?;

    if !canonical.is_dir() {
        return Err("workspaceDir must be a directory".to_string());
    }

    Ok(format_absolute_path(&canonical))
}

/// Resolves a relative or absolute path against the workspace root.
///
/// Relative paths are joined with `workspace`. Absolute paths are accepted when
/// they resolve inside the canonical workspace after symlink resolution.
pub fn resolve_workspace_path(workspace: &Path, raw_path: &str) -> Result<PathBuf, String> {
    resolve_workspace_path_impl(workspace, raw_path, true)
}

/// Like [`resolve_workspace_path`] but does NOT require the resolved path to
/// stay within the workspace.
///
/// Used by read-only exploration tools (`read_file`, `glob`, `grep`,
/// `list_dir`) that should be able to reach files outside the project tree.
/// Writing/mutating tools and the shell working directory must continue using
/// the bounded [`resolve_workspace_path`].
pub fn resolve_workspace_path_unbounded(
    workspace: &Path,
    raw_path: &str,
) -> Result<PathBuf, String> {
    resolve_workspace_path_impl(workspace, raw_path, false)
}

fn resolve_workspace_path_impl(
    workspace: &Path,
    raw_path: &str,
    enforce_workspace: bool,
) -> Result<PathBuf, String> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return Err("path is required".to_string());
    }

    let canonical_workspace = workspace
        .canonicalize()
        .map_err(|error| format!("Invalid workspaceDir: {error}"))?;

    let candidate = if trimmed == "." {
        canonical_workspace.clone()
    } else {
        let path = PathBuf::from(trimmed);
        if path.is_absolute() {
            path
        } else {
            canonical_workspace.join(path)
        }
    };

    let canonical_target = candidate
        .canonicalize()
        .map_err(|_| format!("Invalid path: {}", normalize_raw_path(trimmed)))?;

    if enforce_workspace && !is_within_workspace(&canonical_target, &canonical_workspace) {
        return Err("Path must stay within the workspace".to_string());
    }

    Ok(canonical_target)
}

/// Resolves a write target that may not exist yet.
///
/// Existing path prefixes are canonicalized so symlink escapes are rejected.
/// Missing parent directories are preserved for create-style operations.
pub fn resolve_workspace_write_path(workspace: &Path, raw_path: &str) -> Result<PathBuf, String> {
    resolve_workspace_write_path_impl(workspace, raw_path, true)
}

/// Like [`resolve_workspace_write_path`] but does NOT require the resolved path
/// to stay within the workspace.
///
/// Used by read-only exploration tools (`read_file`, `grep`, `list_dir`) that
/// should be able to reach existing or not-yet-created files outside the project
/// tree. Writing/mutating tools must continue using the bounded
/// [`resolve_workspace_write_path`].
pub fn resolve_workspace_write_path_unbounded(
    workspace: &Path,
    raw_path: &str,
) -> Result<PathBuf, String> {
    resolve_workspace_write_path_impl(workspace, raw_path, false)
}

fn resolve_workspace_write_path_impl(
    workspace: &Path,
    raw_path: &str,
    enforce_workspace: bool,
) -> Result<PathBuf, String> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return Err("path is required".to_string());
    }
    if trimmed == "." {
        return Err("path must refer to a file".to_string());
    }

    let canonical_workspace = workspace
        .canonicalize()
        .map_err(|error| format!("Invalid workspaceDir: {error}"))?;

    let candidate = {
        let path = PathBuf::from(trimmed);
        if path.is_absolute() {
            path
        } else {
            canonical_workspace.join(path)
        }
    };

    let resolved = resolve_with_missing_suffix(&candidate, trimmed)?;

    if enforce_workspace && !is_within_workspace(&resolved, &canonical_workspace) {
        return Err("Path must stay within the workspace".to_string());
    }

    Ok(resolved)
}

fn resolve_with_missing_suffix(path: &Path, raw_path: &str) -> Result<PathBuf, String> {
    if path.exists() {
        return path
            .canonicalize()
            .map_err(|_| format!("Invalid path: {}", normalize_raw_path(raw_path)));
    }

    let mut suffix: Vec<std::ffi::OsString> = Vec::new();
    let mut current = path.to_path_buf();

    while !current.exists() {
        let file_name = current
            .file_name()
            .ok_or_else(|| "Invalid path".to_string())?
            .to_os_string();
        suffix.push(file_name);
        current = current
            .parent()
            .ok_or_else(|| "Invalid path".to_string())?
            .to_path_buf();
    }

    let canonical_base = current
        .canonicalize()
        .map_err(|_| format!("Invalid path: {}", normalize_raw_path(raw_path)))?;

    let mut resolved = canonical_base;
    while let Some(component) = suffix.pop() {
        resolved.push(component);
    }

    Ok(resolved)
}

/// Returns the workspace-relative path using forward slashes.
pub fn workspace_relative_path(workspace: &Path, absolute_path: &Path) -> String {
    let canonical_workspace = workspace
        .canonicalize()
        .unwrap_or_else(|_| workspace.to_path_buf());
    let canonical_path = absolute_path
        .canonicalize()
        .unwrap_or_else(|_| absolute_path.to_path_buf());

    canonical_path
        .strip_prefix(&canonical_workspace)
        .unwrap_or(absolute_path)
        .to_string_lossy()
        .replace('\\', "/")
}

/// Normalizes a raw tool path input for display in error messages.
pub fn normalize_raw_path(raw_path: &str) -> String {
    raw_path.trim().replace('\\', "/")
}

/// Formats a resolved path for model-facing error messages.
///
/// Prefers workspace-relative paths so models are not steered toward absolute
/// Windows paths (including `\\?\` verbatim prefixes from `canonicalize()`).
pub fn format_error_path(
    canonical_workspace: &Path,
    resolved: &Path,
    raw_fallback: &str,
) -> String {
    if resolved.starts_with(canonical_workspace) {
        let relative = workspace_relative_path(canonical_workspace, resolved);
        if relative.is_empty() {
            return ".".to_string();
        }
        return relative;
    }

    normalize_raw_path(raw_fallback)
}

/// Returns a human-readable absolute path using forward slashes.
///
/// On Windows, strips the `\\?\` verbatim prefix produced by `canonicalize()`.
pub fn format_absolute_path(path: &Path) -> String {
    strip_windows_verbatim_prefix(&path.to_string_lossy()).replace('\\', "/")
}

pub fn strip_windows_verbatim_prefix(path: &str) -> String {
    const VERBATIM_PREFIX: &str = r"\\?\";
    const VERBATIM_UNC_PREFIX: &str = r"\\?\UNC\";

    if let Some(rest) = path.strip_prefix(VERBATIM_UNC_PREFIX) {
        return format!(r"\\{rest}");
    }

    if let Some(rest) = path.strip_prefix(VERBATIM_PREFIX) {
        return rest.to_string();
    }

    path.to_string()
}

/// Resolves a canonical workspace path without the Windows `\\?\` verbatim prefix.
///
/// On Windows, `Path::canonicalize()` returns paths prefixed with `\\?\`, which
/// CMD.EXE does not support as a current-directory (`UNC 路径不受支持`). This
/// function strips that prefix before returning the `PathBuf` so that child
/// processes receive a plain `C:\...` path instead.
#[cfg(target_os = "windows")]
pub fn resolve_workspace_path_for_shell(workspace: &Path, raw_path: &str) -> Result<PathBuf, String> {
    let resolved = resolve_workspace_path(workspace, raw_path)?;
    let cleaned = strip_windows_verbatim_prefix(&resolved.to_string_lossy());
    Ok(PathBuf::from(cleaned))
}

fn is_within_workspace(target: &Path, workspace: &Path) -> bool {
    target.starts_with(workspace)
}

#[cfg(test)]
mod tests {
    use super::resolve_workspace_path;
    use std::fs;
    use std::path::PathBuf;

    fn temp_workspace(name: &str) -> PathBuf {
        let temp = std::env::temp_dir().join(format!(
            "coder-workspace-path-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&temp).expect("create temp dir");
        temp
    }

    #[test]
    fn rejects_parent_directory_escape() {
        let temp = temp_workspace("escape");
        let error = resolve_workspace_path(&temp, "../").expect_err("parent path");
        assert!(error.contains("within the workspace"));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn accepts_relative_workspace_child() {
        let temp = temp_workspace("child");
        let child = temp.join("src");
        fs::create_dir_all(&child).expect("create child dir");
        let resolved = resolve_workspace_path(&temp, "src").expect("resolve child");
        assert_eq!(resolved, child.canonicalize().expect("canonical child"));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn accepts_absolute_path_inside_workspace() {
        let temp = temp_workspace("absolute");
        let child = temp.join("src");
        fs::create_dir_all(&child).expect("create child dir");
        let absolute = child.canonicalize().expect("canonical child");
        let resolved =
            resolve_workspace_path(&temp, absolute.to_string_lossy().as_ref()).expect("absolute");
        assert_eq!(resolved, absolute);
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_absolute_path_outside_workspace() {
        let temp = temp_workspace("outside");
        let outside = std::env::temp_dir().canonicalize().expect("temp dir");
        if outside.starts_with(&temp) {
            let _ = fs::remove_dir_all(temp);
            return;
        }
        let error = resolve_workspace_path(&temp, outside.to_string_lossy().as_ref())
            .expect_err("outside path");
        assert!(error.contains("within the workspace"));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn resolves_nonexistent_write_path_inside_workspace() {
        let temp = temp_workspace("write");
        let canonical_workspace = temp.canonicalize().expect("canonical workspace");
        let resolved =
            super::resolve_workspace_write_path(&temp, "src/new.ts").expect("resolve write path");
        assert!(resolved.starts_with(&canonical_workspace));
        assert_eq!(
            resolved.file_name().and_then(|name| name.to_str()),
            Some("new.ts")
        );
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_empty_path() {
        let temp = temp_workspace("empty");
        let error = resolve_workspace_path(&temp, "   ").expect_err("empty path");
        assert!(error.contains("required"));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn validate_workspace_dir_accepts_existing_directory() {
        let temp = temp_workspace("validate");
        let validated =
            super::validate_workspace_dir(temp.to_string_lossy().as_ref()).expect("validate");
        assert_eq!(
            validated,
            super::format_absolute_path(&temp.canonicalize().expect("canonical"))
        );
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn validate_workspace_dir_rejects_missing_path() {
        let missing = std::env::temp_dir().join(format!(
            "coder-missing-workspace-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        let error = super::validate_workspace_dir(missing.to_string_lossy().as_ref())
            .expect_err("missing path");
        assert!(error.contains("Invalid workspaceDir"));
    }

    #[test]
    fn format_error_path_prefers_workspace_relative() {
        use super::{format_error_path, normalize_raw_path};

        let temp = temp_workspace("error-path");
        let canonical_workspace = temp.canonicalize().expect("canonical workspace");
        let child = temp.join("src/missing.ts");
        assert_eq!(
            format_error_path(&canonical_workspace, &child, "src/missing.ts"),
            "src/missing.ts"
        );
        assert_eq!(normalize_raw_path(r"src\foo.rs"), "src/foo.rs");
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn format_error_path_uses_dot_for_workspace_root() {
        use super::format_error_path;

        let temp = temp_workspace("error-root");
        let canonical_workspace = temp.canonicalize().expect("canonical workspace");
        assert_eq!(
            format_error_path(&canonical_workspace, &canonical_workspace, "."),
            "."
        );
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn format_absolute_path_strips_windows_verbatim_prefix() {
        use super::format_absolute_path;
        use std::path::Path;

        let path = Path::new(r"\\?\C:\Users\test\file.txt");
        assert_eq!(
            format_absolute_path(path),
            "C:/Users/test/file.txt"
        );

        let unc = Path::new(r"\\?\UNC\server\share\file.txt");
        assert_eq!(
            format_absolute_path(unc),
            "//server/share/file.txt"
        );
    }

    #[test]
    fn workspace_coder_subdir_groups_under_coder_dir() {
        use super::{workspace_coder_dir, workspace_coder_subdir, CODER_DIR_NAME};

        let temp = temp_workspace("coder-subdir");
        assert_eq!(workspace_coder_dir(&temp), temp.join(".coder"));
        assert_eq!(workspace_coder_subdir(&temp, "plan"), temp.join(".coder/plan"));
        assert_eq!(
            workspace_coder_subdir(&temp, "history"),
            temp.join(".coder/history")
        );
        // The subdir name must be nested under .coder, not appended to it.
        assert!(workspace_coder_subdir(&temp, "skills")
            .to_string_lossy()
            .ends_with(&format!("{CODER_DIR_NAME}/skills")));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn unbounded_accepts_absolute_path_outside_workspace() {
        let temp = temp_workspace("unbounded-outside");
        let outside = std::env::temp_dir().canonicalize().expect("temp dir");
        if outside.starts_with(&temp) {
            let _ = fs::remove_dir_all(&temp);
            return;
        }
        let resolved = super::resolve_workspace_path_unbounded(
            &temp,
            outside.to_string_lossy().as_ref(),
        )
        .expect("unbounded resolves outside");
        assert_eq!(resolved, outside);
        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn unbounded_write_accepts_absolute_path_outside_workspace() {
        let temp = temp_workspace("unbounded-write-outside");
        let outside = std::env::temp_dir().canonicalize().expect("temp dir");
        if outside.starts_with(&temp) {
            let _ = fs::remove_dir_all(&temp);
            return;
        }
        let resolved = super::resolve_workspace_write_path_unbounded(
            &temp,
            outside.to_string_lossy().as_ref(),
        )
        .expect("unbounded write resolves outside");
        assert_eq!(resolved, outside);
        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn unbounded_still_rejects_empty_path() {
        let temp = temp_workspace("unbounded-empty");
        let error =
            super::resolve_workspace_path_unbounded(&temp, "   ").expect_err("empty path");
        assert!(error.contains("required"));
        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn unbounded_write_still_rejects_dot() {
        let temp = temp_workspace("unbounded-dot");
        let error = super::resolve_workspace_write_path_unbounded(&temp, ".")
            .expect_err("dot not allowed for write");
        assert!(error.contains("must refer to a file"));
        let _ = fs::remove_dir_all(&temp);
    }
}
