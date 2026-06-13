use std::fs;
use std::path::PathBuf;

use serde::Serialize;

use super::text_file::{
    atomic_write_bytes, count_lines, encode_text, is_sensitive_path, sha256_hex, TextFileToolError,
    MAX_WRITE_BYTES,
};
use super::workspace_path::{format_error_path, resolve_workspace_write_path, workspace_relative_path};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteFileResult {
    pub path: String,
    pub action: String,
    pub sha256: String,
    pub bytes_written: u64,
    pub lines_added: u32,
    pub lines_removed: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub backup_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warning: Option<String>,
}

#[tauri::command]
pub fn tool_write_file(
    workspace_dir: String,
    path: String,
    content: String,
    create_parent_dirs: Option<bool>,
) -> Result<WriteFileResult, TextFileToolError> {
    let workspace = PathBuf::from(workspace_dir.trim());
    if workspace.as_os_str().is_empty() {
        return Err(TextFileToolError::new(
            "workspace_required",
            "workspaceDir is required",
        ));
    }

    let create_parent_dirs = create_parent_dirs.unwrap_or(true);
    let canonical_workspace = workspace
        .canonicalize()
        .map_err(|error| TextFileToolError::new("invalid_workspace", error.to_string()))?;

    let target = resolve_workspace_write_path(&workspace, &path)
        .map_err(|error| TextFileToolError::new("invalid_path", error))?;

    if target.exists() {
        return Err(TextFileToolError::new(
            "file_already_exists",
            format!(
                "File already exists: {}",
                format_error_path(&canonical_workspace, &target, &path)
            ),
        ));
    }

    let content_bytes = content.as_bytes();
    if content_bytes.len() > MAX_WRITE_BYTES {
        return Err(TextFileToolError {
            code: "file_too_large".to_string(),
            message: format!(
                "Content exceeds the {MAX_WRITE_BYTES} byte write limit ({} bytes)",
                content_bytes.len()
            ),
            mime_type: None,
            size: Some(content_bytes.len() as u64),
        });
    }

    if !create_parent_dirs {
        let parent = target.parent().ok_or_else(|| {
            TextFileToolError::new("invalid_path", "File path has no parent directory")
        })?;
        if !parent.exists() {
            return Err(TextFileToolError::new(
                "parent_not_found",
                format!(
                    "Parent directory does not exist: {}",
                    format_error_path(&canonical_workspace, parent, &path)
                ),
            ));
        }
    }

    let encoded = encode_text(&content, "utf-8")?;
    let relative_path = workspace_relative_path(&canonical_workspace, &target);
    let warning = if is_sensitive_path(&relative_path) {
        Some("SENSITIVE_FILE".to_string())
    } else {
        None
    };

    atomic_write_bytes(&target, &encoded, None)?;

    let metadata = fs::metadata(&target).map_err(|error| {
        TextFileToolError::new(
            "io_error",
            format!("Failed to read written file metadata: {error}"),
        )
    })?;

    Ok(WriteFileResult {
        path: relative_path,
        action: "created".to_string(),
        sha256: sha256_hex(&encoded),
        bytes_written: metadata.len(),
        lines_added: count_lines(&content),
        lines_removed: 0,
        backup_path: None,
        warning,
    })
}

#[cfg(test)]
mod tests {
    use super::tool_write_file;
    use std::fs;
    use std::path::PathBuf;

    fn temp_workspace(name: &str) -> PathBuf {
        let temp = std::env::temp_dir().join(format!(
            "coder-write-file-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&temp).expect("create temp dir");
        temp
    }

    #[test]
    fn creates_new_file() {
        let temp = temp_workspace("create");
        let result = tool_write_file(
            temp.to_string_lossy().into_owned(),
            "src/new.ts".to_string(),
            "const value = 1;\n".to_string(),
            Some(true),
        )
        .expect("write file");

        assert_eq!(result.path, "src/new.ts");
        assert_eq!(result.action, "created");
        assert_eq!(result.lines_added, 1);
        assert_eq!(result.lines_removed, 0);
        assert!(result.sha256.len() == 64);
        assert_eq!(
            fs::read_to_string(temp.join("src/new.ts")).expect("read"),
            "const value = 1;\n"
        );
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_existing_file() {
        let temp = temp_workspace("exists");
        fs::write(temp.join("existing.txt"), "old").expect("seed file");

        let error = tool_write_file(
            temp.to_string_lossy().into_owned(),
            "existing.txt".to_string(),
            "new".to_string(),
            None,
        )
        .expect_err("existing file");

        assert_eq!(error.code, "file_already_exists");
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn warns_on_sensitive_paths() {
        let temp = temp_workspace("sensitive");
        let result = tool_write_file(
            temp.to_string_lossy().into_owned(),
            ".env".to_string(),
            "KEY=value\n".to_string(),
            None,
        )
        .expect("write sensitive");

        assert_eq!(result.warning.as_deref(), Some("SENSITIVE_FILE"));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_oversized_content() {
        let temp = temp_workspace("large");
        let content = "a".repeat(super::super::text_file::MAX_WRITE_BYTES + 1);
        let error = tool_write_file(
            temp.to_string_lossy().into_owned(),
            "large.txt".to_string(),
            content,
            None,
        )
        .expect_err("too large");

        assert_eq!(error.code, "file_too_large");
        let _ = fs::remove_dir_all(temp);
    }
}
