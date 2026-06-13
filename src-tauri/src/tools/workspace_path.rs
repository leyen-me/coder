use std::path::{Path, PathBuf};

/// Resolves a relative or absolute path against the workspace root.
///
/// Relative paths are joined with `workspace`. Absolute paths are accepted when
/// they resolve inside the canonical workspace after symlink resolution.
pub fn resolve_workspace_path(workspace: &Path, raw_path: &str) -> Result<PathBuf, String> {
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

    if !is_within_workspace(&canonical_target, &canonical_workspace) {
        return Err("Path must stay within the workspace".to_string());
    }

    Ok(canonical_target)
}

/// Resolves a write target that may not exist yet.
///
/// Existing path prefixes are canonicalized so symlink escapes are rejected.
/// Missing parent directories are preserved for create-style operations.
pub fn resolve_workspace_write_path(workspace: &Path, raw_path: &str) -> Result<PathBuf, String> {
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

    if !is_within_workspace(&resolved, &canonical_workspace) {
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

fn strip_windows_verbatim_prefix(path: &str) -> String {
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
}
