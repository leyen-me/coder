use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use super::text_file::TextFileToolError;
use super::workspace_path::{
    format_absolute_path, resolve_workspace_path, resolve_workspace_write_path,
    workspace_relative_path,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathOperationResult {
    pub path: String,
    pub action: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedWorkspaceReference {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
}

fn parse_workspace(workspace_dir: &str) -> Result<PathBuf, TextFileToolError> {
    let workspace = PathBuf::from(workspace_dir.trim());
    if workspace.as_os_str().is_empty() {
        return Err(TextFileToolError::new(
            "workspace_required",
            "workspaceDir is required",
        ));
    }
    Ok(workspace)
}

fn canonical_workspace(workspace: &Path) -> Result<PathBuf, TextFileToolError> {
    workspace
        .canonicalize()
        .map_err(|error| TextFileToolError::new("invalid_workspace", error.to_string()))
}

fn ensure_not_workspace_root(
    canonical_workspace: &Path,
    target: &Path,
) -> Result<(), TextFileToolError> {
    if target == canonical_workspace {
        return Err(TextFileToolError::new(
            "invalid_operation",
            "Cannot modify the workspace root",
        ));
    }
    Ok(())
}

fn validate_entry_name(name: &str) -> Result<(), TextFileToolError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(TextFileToolError::new(
            "invalid_name",
            "Name must not be empty",
        ));
    }
    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err(TextFileToolError::new(
            "invalid_name",
            "Name must not contain path separators",
        ));
    }
    if trimmed == "." || trimmed == ".." {
        return Err(TextFileToolError::new(
            "invalid_name",
            "Name must not be . or ..",
        ));
    }
    Ok(())
}

fn remove_path(path: &Path, recursive: bool) -> Result<(), TextFileToolError> {
    if path.is_dir() {
        if recursive {
            fs::remove_dir_all(path).map_err(|error| {
                TextFileToolError::new("io_error", format!("Failed to delete directory: {error}"))
            })?;
        } else {
            fs::remove_dir(path).map_err(|error| {
                TextFileToolError::new(
                    "io_error",
                    format!("Failed to delete directory (not empty): {error}"),
                )
            })?;
        }
    } else {
        fs::remove_file(path).map_err(|error| {
            TextFileToolError::new("io_error", format!("Failed to delete file: {error}"))
        })?;
    }
    Ok(())
}

fn copy_recursively(source: &Path, dest: &Path) -> Result<(), TextFileToolError> {
    if source.is_dir() {
        fs::create_dir_all(dest).map_err(|error| {
            TextFileToolError::new(
                "io_error",
                format!("Failed to create destination directory: {error}"),
            )
        })?;

        for entry in fs::read_dir(source).map_err(|error| {
            TextFileToolError::new("io_error", format!("Failed to read directory: {error}"))
        })? {
            let entry = entry.map_err(|error| {
                TextFileToolError::new("io_error", format!("Failed to read entry: {error}"))
            })?;
            copy_recursively(&entry.path(), &dest.join(entry.file_name()))?;
        }
        return Ok(());
    }

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            TextFileToolError::new(
                "io_error",
                format!("Failed to create parent directory: {error}"),
            )
        })?;
    }

    fs::copy(source, dest).map_err(|error| {
        TextFileToolError::new("io_error", format!("Failed to copy file: {error}"))
    })?;
    Ok(())
}

#[tauri::command]
pub fn tool_delete_path(
    workspace_dir: String,
    path: String,
    recursive: Option<bool>,
) -> Result<PathOperationResult, TextFileToolError> {
    let workspace = parse_workspace(&workspace_dir)?;
    let canonical_workspace = canonical_workspace(&workspace)?;
    let target = resolve_workspace_path(&workspace, &path)
        .map_err(|error| TextFileToolError::new("invalid_path", error))?;

    ensure_not_workspace_root(&canonical_workspace, &target)?;

    if !target.exists() {
        return Err(TextFileToolError::new(
            "not_found",
            format!("Path does not exist: {}", target.display()),
        ));
    }

    let recursive = recursive.unwrap_or(target.is_dir());
    remove_path(&target, recursive)?;

    Ok(PathOperationResult {
        path: workspace_relative_path(&canonical_workspace, &target),
        action: "deleted".to_string(),
    })
}

#[tauri::command]
pub fn tool_rename_path(
    workspace_dir: String,
    path: String,
    new_name: String,
) -> Result<PathOperationResult, TextFileToolError> {
    validate_entry_name(&new_name)?;

    let workspace = parse_workspace(&workspace_dir)?;
    let canonical_workspace = canonical_workspace(&workspace)?;
    let source = resolve_workspace_path(&workspace, &path)
        .map_err(|error| TextFileToolError::new("invalid_path", error))?;

    ensure_not_workspace_root(&canonical_workspace, &source)?;

    let parent = source.parent().ok_or_else(|| {
        TextFileToolError::new("invalid_path", "Path has no parent directory")
    })?;
    let dest = parent.join(new_name.trim());

    if dest.exists() {
        return Err(TextFileToolError::new(
            "already_exists",
            format!("Path already exists: {}", dest.display()),
        ));
    }

    fs::rename(&source, &dest).map_err(|error| {
        TextFileToolError::new("io_error", format!("Failed to rename path: {error}"))
    })?;

    Ok(PathOperationResult {
        path: workspace_relative_path(&canonical_workspace, &dest),
        action: "renamed".to_string(),
    })
}

#[tauri::command]
pub fn tool_create_dir(
    workspace_dir: String,
    path: String,
) -> Result<PathOperationResult, TextFileToolError> {
    let workspace = parse_workspace(&workspace_dir)?;
    let canonical_workspace = canonical_workspace(&workspace)?;
    let target = resolve_workspace_write_path(&workspace, &path)
        .map_err(|error| TextFileToolError::new("invalid_path", error))?;

    ensure_not_workspace_root(&canonical_workspace, &target)?;

    if target.exists() {
        return Err(TextFileToolError::new(
            "already_exists",
            format!("Path already exists: {}", target.display()),
        ));
    }

    fs::create_dir_all(&target).map_err(|error| {
        TextFileToolError::new("io_error", format!("Failed to create directory: {error}"))
    })?;

    Ok(PathOperationResult {
        path: workspace_relative_path(&canonical_workspace, &target),
        action: "created".to_string(),
    })
}

#[tauri::command]
pub fn tool_copy_path(
    workspace_dir: String,
    source_path: String,
    dest_path: String,
) -> Result<PathOperationResult, TextFileToolError> {
    let workspace = parse_workspace(&workspace_dir)?;
    let canonical_workspace = canonical_workspace(&workspace)?;
    let source = resolve_workspace_path(&workspace, &source_path)
        .map_err(|error| TextFileToolError::new("invalid_path", error))?;
    let dest = resolve_workspace_write_path(&workspace, &dest_path)
        .map_err(|error| TextFileToolError::new("invalid_path", error))?;

    if !source.exists() {
        return Err(TextFileToolError::new(
            "not_found",
            format!("Source path does not exist: {}", source.display()),
        ));
    }

    if dest.exists() {
        return Err(TextFileToolError::new(
            "already_exists",
            format!("Destination already exists: {}", dest.display()),
        ));
    }

    if source.starts_with(&dest) && source.is_dir() {
        return Err(TextFileToolError::new(
            "invalid_operation",
            "Cannot copy a directory into itself",
        ));
    }

    copy_recursively(&source, &dest)?;

    Ok(PathOperationResult {
        path: workspace_relative_path(&canonical_workspace, &dest),
        action: "copied".to_string(),
    })
}

#[tauri::command]
pub fn tool_move_path(
    workspace_dir: String,
    source_path: String,
    dest_path: String,
) -> Result<PathOperationResult, TextFileToolError> {
    let workspace = parse_workspace(&workspace_dir)?;
    let canonical_workspace = canonical_workspace(&workspace)?;
    let source = resolve_workspace_path(&workspace, &source_path)
        .map_err(|error| TextFileToolError::new("invalid_path", error))?;
    let dest = resolve_workspace_write_path(&workspace, &dest_path)
        .map_err(|error| TextFileToolError::new("invalid_path", error))?;

    ensure_not_workspace_root(&canonical_workspace, &source)?;

    if !source.exists() {
        return Err(TextFileToolError::new(
            "not_found",
            format!("Source path does not exist: {}", source.display()),
        ));
    }

    if dest.exists() {
        return Err(TextFileToolError::new(
            "already_exists",
            format!("Destination already exists: {}", dest.display()),
        ));
    }

    if dest.starts_with(&source) && source.is_dir() {
        return Err(TextFileToolError::new(
            "invalid_operation",
            "Cannot move a directory into itself",
        ));
    }

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            TextFileToolError::new(
                "io_error",
                format!("Failed to create parent directory: {error}"),
            )
        })?;
    }

    fs::rename(&source, &dest).map_err(|error| {
        TextFileToolError::new("io_error", format!("Failed to move path: {error}"))
    })?;

    Ok(PathOperationResult {
        path: workspace_relative_path(&canonical_workspace, &dest),
        action: "moved".to_string(),
    })
}

#[tauri::command]
pub fn tool_resolve_absolute_path(
    workspace_dir: String,
    path: String,
) -> Result<String, TextFileToolError> {
    let workspace = parse_workspace(&workspace_dir)?;
    let absolute = match resolve_workspace_path(&workspace, &path) {
        Ok(resolved) => resolved,
        Err(_) => resolve_workspace_write_path(&workspace, &path)
            .map_err(|error| TextFileToolError::new("invalid_path", error))?,
    };

    Ok(format_absolute_path(&absolute))
}

#[tauri::command]
pub fn tool_normalize_external_path(
    workspace_dir: String,
    absolute_path: String,
) -> Result<NormalizedWorkspaceReference, TextFileToolError> {
    let workspace = parse_workspace(&workspace_dir)?;
    let canonical_workspace = canonical_workspace(&workspace)?;
    let target = resolve_workspace_path(&workspace, absolute_path.trim()).map_err(|error| {
        if error.contains("within the workspace") {
            TextFileToolError::new("outside_workspace", error)
        } else {
            TextFileToolError::new("invalid_path", error)
        }
    })?;

    let name = target
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| workspace_relative_path(&canonical_workspace, &target));

    Ok(NormalizedWorkspaceReference {
        path: workspace_relative_path(&canonical_workspace, &target),
        name,
        is_dir: target.is_dir(),
    })
}

#[cfg(test)]
mod tests {
    use super::{
        tool_copy_path, tool_create_dir, tool_delete_path, tool_move_path, tool_normalize_external_path,
        tool_rename_path,
    };
    use std::fs;
    use std::path::PathBuf;

    fn temp_workspace(name: &str) -> PathBuf {
        let temp = std::env::temp_dir().join(format!(
            "coder-file-ops-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&temp).expect("create temp dir");
        temp
    }

    #[test]
    fn creates_and_deletes_file() {
        let temp = temp_workspace("file");
        tool_create_dir(
            temp.to_string_lossy().into_owned(),
            "src".to_string(),
        )
        .expect("create dir");

        fs::write(temp.join("src/note.txt"), "hello").expect("write file");

        tool_delete_path(
            temp.to_string_lossy().into_owned(),
            "src/note.txt".to_string(),
            None,
        )
        .expect("delete file");

        assert!(!temp.join("src/note.txt").exists());
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn renames_file() {
        let temp = temp_workspace("rename");
        fs::write(temp.join("old.txt"), "data").expect("write file");

        let result = tool_rename_path(
            temp.to_string_lossy().into_owned(),
            "old.txt".to_string(),
            "new.txt".to_string(),
        )
        .expect("rename");

        assert_eq!(result.path, "new.txt");
        assert!(temp.join("new.txt").exists());
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn copies_and_moves_directory() {
        let temp = temp_workspace("copy-move");
        fs::create_dir_all(temp.join("src")).expect("create src");
        fs::write(temp.join("src/a.txt"), "a").expect("write a");

        tool_copy_path(
            temp.to_string_lossy().into_owned(),
            "src".to_string(),
            "src-copy".to_string(),
        )
        .expect("copy dir");

        assert!(temp.join("src-copy/a.txt").exists());

        tool_move_path(
            temp.to_string_lossy().into_owned(),
            "src-copy".to_string(),
            "moved".to_string(),
        )
        .expect("move dir");

        assert!(!temp.join("src-copy").exists());
        assert!(temp.join("moved/a.txt").exists());
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_workspace_root_delete() {
        let temp = temp_workspace("root");
        let error = tool_delete_path(temp.to_string_lossy().into_owned(), ".".to_string(), None)
            .expect_err("delete root");

        assert_eq!(error.code, "invalid_operation");
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn normalizes_external_absolute_path_to_workspace_relative() {
        let temp = temp_workspace("normalize");
        fs::create_dir_all(temp.join("src")).expect("create src");
        fs::write(temp.join("src/App.tsx"), "export {}").expect("write file");

        let absolute = temp.join("src/App.tsx").canonicalize().expect("canonical file");
        let normalized = tool_normalize_external_path(
            temp.to_string_lossy().into_owned(),
            absolute.to_string_lossy().into_owned(),
        )
        .expect("normalize");

        assert_eq!(normalized.path, "src/App.tsx");
        assert_eq!(normalized.name, "App.tsx");
        assert!(!normalized.is_dir);
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_external_path_outside_workspace() {
        let temp = temp_workspace("outside");
        let outside = std::env::temp_dir().canonicalize().expect("temp dir");
        if outside.starts_with(&temp) {
            let _ = fs::remove_dir_all(temp);
            return;
        }

        let error = tool_normalize_external_path(
            temp.to_string_lossy().into_owned(),
            outside.to_string_lossy().into_owned(),
        )
        .expect_err("outside path");

        assert_eq!(error.code, "outside_workspace");
        let _ = fs::remove_dir_all(temp);
    }
}
