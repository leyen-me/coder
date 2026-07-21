use std::path::PathBuf;

use super::file_modify::{
    commit_text_modification, load_existing_text_file, verify_expected_sha256, FileModifyResult,
};
use super::text_file::{TextFileToolError, MAX_WRITE_BYTES};

pub fn tool_replace_file(
    workspace_dir: String,
    path: String,
    content: String,
    expected_sha256: Option<String>,
    create_backup: Option<bool>,
    respect_gitignore: Option<bool>,
) -> Result<FileModifyResult, TextFileToolError> {
    let workspace = PathBuf::from(workspace_dir.trim());
    if workspace.as_os_str().is_empty() {
        return Err(TextFileToolError::new(
            "workspace_required",
            "workspaceDir is required",
        ));
    }

    // Rollback via .history is not wired up yet; keep backups off unless explicitly requested.
    let create_backup = create_backup.unwrap_or(false);
    let respect_gitignore = respect_gitignore.unwrap_or(true);

    if content.len() > MAX_WRITE_BYTES {
        return Err(TextFileToolError {
            code: "file_too_large".to_string(),
            message: format!(
                "Content exceeds the {MAX_WRITE_BYTES} byte write limit ({} bytes)",
                content.len()
            ),
            mime_type: None,
            size: Some(content.len() as u64),
            file_snippet_hex: None,
        });
    }

    let (target, relative_path, loaded) =
        load_existing_text_file(&workspace, &path, respect_gitignore)?;
    verify_expected_sha256(&loaded.original_bytes, expected_sha256.as_deref())?;

    commit_text_modification(
        &workspace,
        &target,
        &relative_path,
        &loaded,
        &content,
        "replaced",
        create_backup,
    )
}

#[cfg(test)]
mod tests {
    use super::super::text_file::sha256_hex;
    use super::tool_replace_file;
    use std::fs;
    use std::path::PathBuf;

    fn temp_workspace(name: &str) -> PathBuf {
        let temp = std::env::temp_dir().join(format!(
            "coder-replace-file-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&temp).expect("create temp dir");
        temp
    }

    #[test]
    fn replaces_existing_file() {
        let temp = temp_workspace("replace");
        fs::write(temp.join("sample.txt"), "old\n").expect("seed");

        let result = tool_replace_file(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            "new\n".to_string(),
            None,
            Some(false),
            Some(false),
        )
        .expect("replace");

        assert_eq!(result.action, "replaced");
        assert_eq!(
            fs::read_to_string(temp.join("sample.txt")).expect("read"),
            "new\n"
        );
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_changed_file_when_hash_guard_fails() {
        let temp = temp_workspace("hash");
        let bytes = b"old\n";
        fs::write(temp.join("sample.txt"), bytes).expect("seed");

        let error = tool_replace_file(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            "new\n".to_string(),
            Some("deadbeef".to_string()),
            None,
            Some(false),
        )
        .expect_err("hash mismatch");

        assert_eq!(error.code, "file_changed");
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn accepts_matching_hash_guard() {
        let temp = temp_workspace("hash-ok");
        let bytes = b"old\n";
        fs::write(temp.join("sample.txt"), bytes).expect("seed");
        let hash = sha256_hex(bytes);

        let result = tool_replace_file(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            "new\n".to_string(),
            Some(hash),
            None,
            Some(false),
        )
        .expect("replace with hash");

        assert_eq!(result.action, "replaced");
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn preserves_crlf_line_endings() {
        let temp = temp_workspace("crlf");
        fs::write(temp.join("sample.txt"), "a\r\nb\r\n").expect("seed");

        tool_replace_file(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            "x\ny\n".to_string(),
            None,
            None,
            Some(false),
        )
        .expect("replace");

        assert_eq!(
            fs::read(temp.join("sample.txt")).expect("read"),
            b"x\r\ny\r\n"
        );
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn creates_backup_when_requested() {
        let temp = temp_workspace("backup");
        fs::write(temp.join("sample.txt"), "old\n").expect("seed");

        let result = tool_replace_file(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            "new\n".to_string(),
            None,
            Some(true),
            Some(false),
        )
        .expect("replace");

        assert!(result.__backup_path.is_some());
        assert!(temp.join(".history").exists());
        let _ = fs::remove_dir_all(temp);
    }
}
