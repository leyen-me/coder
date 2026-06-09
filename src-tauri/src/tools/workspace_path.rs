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
        .map_err(|error| format!("Invalid path: {error}"))?;

    if !is_within_workspace(&canonical_target, &canonical_workspace) {
        return Err("Path must stay within the workspace".to_string());
    }

    Ok(canonical_target)
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

/// Returns the absolute path using forward slashes.
pub fn format_absolute_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
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
    fn rejects_empty_path() {
        let temp = temp_workspace("empty");
        let error = resolve_workspace_path(&temp, "   ").expect_err("empty path");
        assert!(error.contains("required"));
        let _ = fs::remove_dir_all(temp);
    }
}
