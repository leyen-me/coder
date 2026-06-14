use std::path::PathBuf;

use super::file_modify::{
    commit_text_modification, load_existing_text_file, verify_expected_sha256, FileModifyResult,
};
use super::text_file::{apply_text_replacement, hex_str_to_bytes, TextFileToolError};

#[tauri::command]
pub fn tool_edit_file(
    workspace_dir: String,
    path: String,
    old_string: String,
    new_string: String,
    old_string_hex: Option<String>,
    expected_sha256: Option<String>,
    replace_all: Option<bool>,
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

    let replace_all = replace_all.unwrap_or(false);
    let create_backup = create_backup.unwrap_or(false);
    let respect_gitignore = respect_gitignore.unwrap_or(true);

    let (target, relative_path, loaded) =
        load_existing_text_file(&workspace, &path, respect_gitignore)?;
    verify_expected_sha256(&loaded.original_bytes, expected_sha256.as_deref())?;

    // Resolve the effective old_string: old_string_hex takes precedence.
    let resolved_old = if let Some(hex) = &old_string_hex {
        let hex = hex.trim();
        if hex.is_empty() {
            return Err(TextFileToolError::new(
                "invalid_arguments",
                "old_string_hex must not be empty when provided",
            ));
        }
        let bytes = hex_str_to_bytes(hex).map_err(|error| {
            TextFileToolError::new(
                "invalid_arguments",
                format!("old_string_hex is not valid hex: {error}"),
            )
        })?;
        let decoded = String::from_utf8(bytes).map_err(|error| {
            TextFileToolError::new(
                "invalid_arguments",
                format!(
                    "old_string_hex does not decode to valid UTF-8: {error}"
                ),
            )
        })?;
        if decoded.is_empty() {
            return Err(TextFileToolError::new(
                "invalid_arguments",
                "old_string_hex decoded to an empty string",
            ));
        }
        decoded
    } else {
        old_string.clone()
    };

    let updated = apply_text_replacement(&loaded.text, &resolved_old, &new_string, replace_all)?;

    commit_text_modification(
        &workspace,
        &target,
        &relative_path,
        &loaded,
        &updated,
        "modified",
        create_backup,
    )
}

#[cfg(test)]
mod tests {
    use super::tool_edit_file;
    use std::fs;
    use std::path::PathBuf;

    fn temp_workspace(name: &str) -> PathBuf {
        let temp = std::env::temp_dir().join(format!(
            "coder-edit-file-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&temp).expect("create temp dir");
        temp
    }

    #[test]
    fn replaces_unique_match() {
        let temp = temp_workspace("unique");
        fs::write(temp.join("sample.ts"), "const a = 1;\nconst b = 2;\n").expect("seed");

        let result = tool_edit_file(
            temp.to_string_lossy().into_owned(),
            "sample.ts".to_string(),
            "const a = 1;".to_string(),
            "const a = 2;".to_string(),
            None,
            None,
            None,
            Some(false),
            Some(false),
        )
        .expect("edit");

        assert_eq!(result.action, "modified");
        assert_eq!(
            fs::read_to_string(temp.join("sample.ts")).expect("read"),
            "const a = 2;\nconst b = 2;\n"
        );
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_multiple_matches_by_default() {
        let temp = temp_workspace("multiple");
        fs::write(temp.join("sample.txt"), "foo\nfoo\n").expect("seed");

        let error = tool_edit_file(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            "foo".to_string(),
            "bar".to_string(),
            None,
            None,
            None,
            None,
            Some(false),
        )
        .expect_err("multiple");

        assert_eq!(error.code, "multiple_matches");
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn replaces_all_when_requested() {
        let temp = temp_workspace("all");
        fs::write(temp.join("sample.txt"), "foo\nfoo\n").expect("seed");

        tool_edit_file(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            "foo".to_string(),
            "bar".to_string(),
            None,
            None,
            Some(true),
            None,
            Some(false),
        )
        .expect("edit all");

        assert_eq!(
            fs::read_to_string(temp.join("sample.txt")).expect("read"),
            "bar\nbar\n"
        );
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_missing_old_string() {
        let temp = temp_workspace("missing");
        fs::write(temp.join("sample.txt"), "alpha\n").expect("seed");

        let error = tool_edit_file(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            "beta".to_string(),
            "gamma".to_string(),
            None,
            None,
            None,
            None,
            Some(false),
        )
        .expect_err("missing");

        assert_eq!(error.code, "string_not_found");
        // Check that hex diagnostics are populated.
        assert!(error.old_string_hex.is_some());
        assert!(error.file_snippet_hex.is_some());
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn matches_across_crlf_boundaries() {
        let temp = temp_workspace("crlf");
        fs::write(temp.join("sample.txt"), "a\r\nb\r\n").expect("seed");

        tool_edit_file(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            "a\nb".to_string(),
            "x".to_string(),
            None,
            None,
            None,
            None,
            Some(false),
        )
        .expect("edit crlf");

        assert_eq!(fs::read(temp.join("sample.txt")).expect("read"), b"x\r\n");
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn matches_using_old_string_hex() {
        let temp = temp_workspace("hex");
        // File content: const x = "hello";
        fs::write(temp.join("sample.txt"), "const x = \"hello\";\n").expect("seed");

        // old_string "hello" encoded as hex: 68 65 6c 6c 6f
        let result = tool_edit_file(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            "".to_string(), // old_string is ignored when old_string_hex is provided
            "world".to_string(),
            Some("68 65 6c 6c 6f".to_string()),
            None,
            None,
            None,
            Some(false),
        )
        .expect("edit with hex");

        assert_eq!(result.action, "modified");
        assert_eq!(
            fs::read_to_string(temp.join("sample.txt")).expect("read"),
            "const x = \"world\";\n"
        );
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_invalid_hex() {
        let temp = temp_workspace("badhex");
        fs::write(temp.join("sample.txt"), "anything\n").expect("seed");

        let error = tool_edit_file(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            "".to_string(),
            "x".to_string(),
            Some("ZZ".to_string()),
            None,
            None,
            None,
            Some(false),
        )
        .expect_err("bad hex");

        assert_eq!(error.code, "invalid_arguments");
        assert!(error.message.contains("not valid hex"));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_empty_hex() {
        let temp = temp_workspace("emptyhex");
        fs::write(temp.join("sample.txt"), "anything\n").expect("seed");

        let error = tool_edit_file(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            "".to_string(),
            "x".to_string(),
            Some("   ".to_string()),
            None,
            None,
            None,
            Some(false),
        )
        .expect_err("empty hex");

        assert_eq!(error.code, "invalid_arguments");
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn hex_can_match_strings_with_special_chars() {
        let temp = temp_workspace("spechex");
        // File content: "escape \" triple" (18 chars with embedded backslash-quote)
        fs::write(temp.join("sample.txt"), "\"escape \\\" triple\"\n").expect("seed");

        // Encode "escape \" triple" as hex:
        // 22 65 73 63 61 70 65 20 5C 22 20 74 72 69 70 6C 65 22
        let hex = "22 65 73 63 61 70 65 20 5C 22 20 74 72 69 70 6C 65 22";
        let result = tool_edit_file(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            "".to_string(),
            "REPLACED".to_string(),
            Some(hex.to_string()),
            None,
            None,
            None,
            Some(false),
        )
        .expect("edit special chars with hex");

        assert_eq!(result.action, "modified");
        assert_eq!(
            fs::read_to_string(temp.join("sample.txt")).expect("read"),
            "REPLACED\n"
        );
        let _ = fs::remove_dir_all(temp);
    }
}
