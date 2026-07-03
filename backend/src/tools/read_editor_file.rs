use std::path::PathBuf;

use serde::Serialize;

use super::file_modify::load_existing_text_file;
use super::text_file::{
    count_lines, detect_secrets, guess_text_mime_type, sha256_hex, TextFileToolError,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadEditorFileResult {
    pub path: String,
    pub encoding: String,
    pub mime_type: String,
    pub sha256: String,
    pub total_lines: u32,
    pub contains_secrets: bool,
    pub content: String,
}

pub fn tool_read_editor_file(
    workspace_dir: String,
    path: String,
    respect_gitignore: Option<bool>,
) -> Result<ReadEditorFileResult, TextFileToolError> {
    let workspace = PathBuf::from(workspace_dir.trim());
    if workspace.as_os_str().is_empty() {
        return Err(TextFileToolError::new(
            "workspace_required",
            "workspaceDir is required",
        ));
    }

    let respect_gitignore = respect_gitignore.unwrap_or(true);
    let (_, relative_path, loaded) =
        load_existing_text_file(&workspace, &path, respect_gitignore)?;

    Ok(ReadEditorFileResult {
        mime_type: guess_text_mime_type(&relative_path),
        sha256: sha256_hex(&loaded.original_bytes),
        total_lines: count_lines(&loaded.text),
        contains_secrets: detect_secrets(&loaded.text),
        content: loaded.text,
        path: relative_path,
        encoding: loaded.encoding.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::tool_read_editor_file;
    use std::fs;
    use std::path::PathBuf;

    fn temp_workspace(name: &str) -> PathBuf {
        let temp = std::env::temp_dir().join(format!(
            "coder-read-editor-file-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&temp).expect("create temp dir");
        temp
    }

    #[test]
    fn reads_full_file_content() {
        let temp = temp_workspace("full");
        let lines: String = (1..=1200)
            .map(|index| format!("line-{index}\n"))
            .collect();
        fs::write(temp.join("large.txt"), &lines).expect("write file");

        let result = tool_read_editor_file(
            temp.to_string_lossy().into_owned(),
            "large.txt".to_string(),
            Some(false),
        )
        .expect("read file");

        assert_eq!(result.path, "large.txt");
        assert_eq!(result.total_lines, 1200);
        assert_eq!(result.content, lines);
        let _ = fs::remove_dir_all(temp);
    }
}
