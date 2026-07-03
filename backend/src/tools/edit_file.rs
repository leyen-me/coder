use std::path::PathBuf;

use super::file_modify::{
    commit_text_modification, load_existing_text_file, verify_expected_sha256, FileModifyResult,
};
use super::text_file::{apply_text_replacement, TextFileToolError};

pub fn tool_edit_file(
    workspace_dir: String,
    path: String,
    old_string: String,
    new_string: String,
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

    let updated = apply_text_replacement(&loaded.text, &old_string, &new_string, replace_all)?;

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
            Some(false),
        )
        .expect_err("missing");

        assert_eq!(error.code, "string_not_found");
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
            Some(false),
        )
        .expect("edit crlf");

        assert_eq!(fs::read(temp.join("sample.txt")).expect("read"), b"x\r\n");
        let _ = fs::remove_dir_all(temp);
    }
}
