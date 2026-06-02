use std::path::{Component, Path, PathBuf};

use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListDirEntry {
    pub name: String,
    pub path: String,
    pub kind: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListDirResult {
    pub path: String,
    pub entries: Vec<ListDirEntry>,
}

#[tauri::command]
pub fn tool_list_dir(workspace_dir: String, path: String) -> Result<ListDirResult, String> {
    let workspace = PathBuf::from(workspace_dir.trim());
    if workspace.as_os_str().is_empty() {
        return Err("workspaceDir is required".to_string());
    }

    let target = resolve_workspace_path(&workspace, &path)?;
    if !target.exists() {
        return Err(format!("Path not found: {}", target.display()));
    }
    if !target.is_dir() {
        return Err(format!("Path is not a directory: {}", target.display()));
    }

    let mut entries = Vec::new();
    let read_dir = std::fs::read_dir(&target)
        .map_err(|error| format!("Failed to read directory: {error}"))?;

    for entry in read_dir {
        let entry = entry.map_err(|error| format!("Failed to read entry: {error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Failed to inspect entry: {error}"))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let entry_path = entry.path();
        let relative = entry_path
            .strip_prefix(&workspace)
            .unwrap_or(entry_path.as_path())
            .to_string_lossy()
            .replace('\\', "/");

        let kind = if file_type.is_dir() {
            "directory"
        } else if file_type.is_file() {
            "file"
        } else if file_type.is_symlink() {
            "symlink"
        } else {
            "other"
        };

        entries.push(ListDirEntry {
            name,
            path: relative,
            kind: kind.to_string(),
        });
    }

    entries.sort_by(|left, right| {
        left.kind
            .cmp(&right.kind)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    let resolved_path = target
        .strip_prefix(&workspace)
        .unwrap_or(target.as_path())
        .to_string_lossy()
        .replace('\\', "/");

    Ok(ListDirResult {
        path: if resolved_path.is_empty() {
            ".".to_string()
        } else {
            resolved_path
        },
        entries,
    })
}

fn resolve_workspace_path(workspace: &Path, raw_path: &str) -> Result<PathBuf, String> {
    let trimmed = raw_path.trim();
    let relative = if trimmed.is_empty() || trimmed == "." {
        PathBuf::from(".")
    } else {
        PathBuf::from(trimmed)
    };

    if relative.is_absolute() {
        return Err("Path must be relative to the workspace".to_string());
    }

    for component in relative.components() {
        if matches!(component, Component::ParentDir) {
            return Err("Path must stay within the workspace".to_string());
        }
    }

    let joined = workspace.join(relative);
    let canonical_workspace = workspace
        .canonicalize()
        .map_err(|error| format!("Invalid workspaceDir: {error}"))?;
    let canonical_target = joined
        .canonicalize()
        .map_err(|error| format!("Invalid path: {error}"))?;

    if !canonical_target.starts_with(&canonical_workspace) {
        return Err("Path must stay within the workspace".to_string());
    }

    Ok(canonical_target)
}

#[cfg(test)]
mod tests {
    use super::resolve_workspace_path;
    use std::fs;

    #[test]
    fn rejects_parent_directory_escape() {
        let temp = std::env::temp_dir().join(format!(
            "coder-list-dir-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&temp).expect("create temp dir");
        let error = resolve_workspace_path(&temp, "../").expect_err("parent path");
        assert!(error.contains("within the workspace"));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn accepts_relative_workspace_child() {
        let temp = std::env::temp_dir().join(format!(
            "coder-list-dir-child-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&temp).expect("create temp dir");
        let resolved = resolve_workspace_path(&temp, ".").expect("resolve workspace root");
        assert_eq!(resolved, temp.canonicalize().expect("canonical temp"));
        let _ = fs::remove_dir_all(temp);
    }
}
