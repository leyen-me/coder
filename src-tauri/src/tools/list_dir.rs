use std::path::{Path, PathBuf};

use serde::Serialize;

use super::workspace_path::{format_absolute_path, resolve_workspace_path, workspace_relative_path};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListDirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListDirResult {
    pub path: String,
    pub entries: Vec<ListDirEntry>,
}

#[tauri::command]
pub fn tool_list_dir(
    workspace_dir: String,
    path: String,
    recursive: Option<bool>,
    max_depth: Option<u32>,
    show_hidden: Option<bool>,
) -> Result<ListDirResult, String> {
    let workspace = PathBuf::from(workspace_dir.trim());
    if workspace.as_os_str().is_empty() {
        return Err("workspaceDir is required".to_string());
    }

    let recursive = recursive.unwrap_or(false);
    let max_depth = max_depth.unwrap_or(1).max(1);
    let show_hidden = show_hidden.unwrap_or(false);

    let canonical_workspace = workspace
        .canonicalize()
        .map_err(|error| format!("Invalid workspaceDir: {error}"))?;
    let target = resolve_workspace_path(&workspace, &path)?;

    if !target.exists() {
        return Err(format!("Path not found: {}", target.display()));
    }
    if !target.is_dir() {
        return Err(format!("Path is not a directory: {}", target.display()));
    }

    let mut entries = Vec::new();
    collect_entries(
        &canonical_workspace,
        &target,
        recursive,
        max_depth,
        show_hidden,
        0,
        &mut entries,
    )?;

    entries.sort_by(|left, right| {
        right
            .is_dir
            .cmp(&left.is_dir)
            .then_with(|| left.path.to_lowercase().cmp(&right.path.to_lowercase()))
    });

    Ok(ListDirResult {
        path: format_absolute_path(&target),
        entries,
    })
}

fn collect_entries(
    workspace: &Path,
    dir: &Path,
    recursive: bool,
    max_depth: u32,
    show_hidden: bool,
    current_depth: u32,
    entries: &mut Vec<ListDirEntry>,
) -> Result<(), String> {
    if current_depth >= max_depth {
        return Ok(());
    }

    let read_dir = std::fs::read_dir(dir)
        .map_err(|error| format!("Failed to read directory: {error}"))?;

    for entry in read_dir {
        let entry = entry.map_err(|error| format!("Failed to read entry: {error}"))?;
        let name = entry.file_name().to_string_lossy().into_owned();

        if !show_hidden && name.starts_with('.') {
            continue;
        }

        let file_type = entry
            .file_type()
            .map_err(|error| format!("Failed to inspect entry: {error}"))?;
        let entry_path = entry.path();
        let is_dir = file_type.is_dir();
        let size = if file_type.is_file() {
            entry
                .metadata()
                .ok()
                .map(|metadata| metadata.len())
        } else {
            None
        };

        entries.push(ListDirEntry {
            name,
            path: workspace_relative_path(workspace, &entry_path),
            is_dir,
            size,
        });

        if recursive && is_dir && current_depth + 1 < max_depth {
            collect_entries(
                workspace,
                &entry_path,
                recursive,
                max_depth,
                show_hidden,
                current_depth + 1,
                entries,
            )?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::tool_list_dir;
    use std::fs;
    use std::path::PathBuf;

    fn temp_workspace(name: &str) -> PathBuf {
        let temp = std::env::temp_dir().join(format!(
            "coder-list-dir-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&temp).expect("create temp dir");
        temp
    }

    #[test]
    fn lists_immediate_children_with_relative_paths() {
        let temp = temp_workspace("list");
        fs::write(temp.join("README.md"), "hello").expect("write file");
        fs::create_dir_all(temp.join("src")).expect("create dir");

        let result = tool_list_dir(
            temp.to_string_lossy().into_owned(),
            ".".to_string(),
            None,
            None,
            None,
        )
        .expect("list dir");

        assert!(result.path.contains("coder-list-dir-list"));
        assert_eq!(result.entries.len(), 2);
        assert!(result.entries.iter().any(|entry| entry.name == "src" && entry.is_dir));
        assert!(result
            .entries
            .iter()
            .any(|entry| entry.name == "README.md" && !entry.is_dir && entry.size == Some(5)));
    }

    #[test]
    fn hides_dotfiles_by_default() {
        let temp = temp_workspace("hidden");
        fs::write(temp.join(".env"), "secret").expect("write hidden file");
        fs::write(temp.join("visible.txt"), "ok").expect("write visible file");

        let result = tool_list_dir(
            temp.to_string_lossy().into_owned(),
            ".".to_string(),
            None,
            None,
            None,
        )
        .expect("list dir");

        assert_eq!(result.entries.len(), 1);
        assert_eq!(result.entries[0].name, "visible.txt");
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn recurses_when_requested() {
        let temp = temp_workspace("recursive");
        fs::create_dir_all(temp.join("src/components")).expect("create nested dir");
        fs::write(temp.join("src/components/button.tsx"), "x").expect("write nested file");

        let result = tool_list_dir(
            temp.to_string_lossy().into_owned(),
            ".".to_string(),
            Some(true),
            Some(3),
            None,
        )
        .expect("list dir");

        assert!(result
            .entries
            .iter()
            .any(|entry| entry.path == "src/components/button.tsx"));
        let _ = fs::remove_dir_all(temp);
    }
}
