use std::path::PathBuf;

use super::file_modify::{
    commit_text_modification, load_existing_text_file, verify_expected_sha256, FileModifyResult,
};
use super::text_file::TextFileToolError;

#[tauri::command]
pub fn tool_replace_lines(
    workspace_dir: String,
    path: String,
    start_line: u32,
    end_line: u32,
    new_content: String,
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

    if start_line == 0 || end_line == 0 {
        return Err(TextFileToolError::new(
            "invalid_range",
            "start_line and end_line are 1-based and must be >= 1",
        ));
    }

    if start_line > end_line {
        return Err(TextFileToolError::new(
            "invalid_range",
            format!("start_line ({start_line}) must be <= end_line ({end_line})"),
        ));
    }

    let create_backup = create_backup.unwrap_or(false);
    let respect_gitignore = respect_gitignore.unwrap_or(true);

    let (target, relative_path, loaded) =
        load_existing_text_file(&workspace, &path, respect_gitignore)?;
    verify_expected_sha256(&loaded.original_bytes, expected_sha256.as_deref())?;

    let lines: Vec<&str> = loaded.text.lines().collect();
    let total_lines = lines.len() as u32;

    if start_line > total_lines {
        return Err(TextFileToolError::new(
            "invalid_range",
            format!(
                "start_line ({start_line}) exceeds file line count ({total_lines})"
            ),
        ));
    }
    if end_line > total_lines {
        return Err(TextFileToolError::new(
            "invalid_range",
            format!(
                "end_line ({end_line}) exceeds file line count ({total_lines})"
            ),
        ));
    }

    let start_idx = (start_line - 1) as usize;
    let end_idx = end_line as usize;

    let before = &lines[..start_idx];
    let after = &lines[end_idx..];

    // Reconstruct: lines before edit + new_content + lines after edit.
    // Sections are joined by "\n"; no trailing newline is appended.
    let mut result = String::new();

    if !before.is_empty() {
        result.push_str(&before.join("\n"));
    }

    if !new_content.is_empty() {
        if !result.is_empty() {
            result.push('\n');
        }
        result.push_str(&new_content);
    }

    if !after.is_empty() {
        if !result.is_empty() && !result.ends_with('\n') {
            result.push('\n');
        }
        result.push_str(&after.join("\n"));
    }

    // Preserve trailing newline if the original file had one.
    // lines() strips trailing newlines, but the convention matters.
    if loaded.text.ends_with('\n') && !result.ends_with('\n') {
        result.push('\n');
    }

    commit_text_modification(
        &workspace,
        &target,
        &relative_path,
        &loaded,
        &result,
        "modified",
        create_backup,
    )
}

#[cfg(test)]
mod tests {
    use super::tool_replace_lines;
    use std::fs;
    use std::path::PathBuf;

    fn temp_workspace(name: &str) -> PathBuf {
        let temp = std::env::temp_dir().join(format!(
            "coder-replace-lines-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&temp).expect("create temp dir");
        temp
    }

    #[test]
    fn replaces_single_line() {
        let temp = temp_workspace("single");
        fs::write(temp.join("sample.txt"), "a\nb\nc\n").expect("seed");

        let result = tool_replace_lines(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            2,
            2,
            "x".to_string(),
            None,
            Some(false),
            Some(false),
        )
        .expect("edit");

        assert_eq!(result.action, "modified");
        assert_eq!(
            fs::read_to_string(temp.join("sample.txt")).expect("read"),
            "a\nx\nc\n"
        );
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn replaces_multiple_lines() {
        let temp = temp_workspace("multi");
        fs::write(temp.join("sample.txt"), "a\nb\nc\nd\n").expect("seed");

        tool_replace_lines(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            2,
            3,
            "x\ny".to_string(),
            None,
            None,
            Some(false),
        )
        .expect("edit");

        assert_eq!(
            fs::read_to_string(temp.join("sample.txt")).expect("read"),
            "a\nx\ny\nd\n"
        );
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn replaces_from_start() {
        let temp = temp_workspace("start");
        fs::write(temp.join("sample.txt"), "a\nb\nc\n").expect("seed");

        tool_replace_lines(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            1,
            1,
            "x".to_string(),
            None,
            None,
            Some(false),
        )
        .expect("edit");

        assert_eq!(
            fs::read_to_string(temp.join("sample.txt")).expect("read"),
            "x\nb\nc\n"
        );
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn replaces_to_end() {
        let temp = temp_workspace("end");
        fs::write(temp.join("sample.txt"), "a\nb\nc\n").expect("seed");

        tool_replace_lines(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            3,
            3,
            "x".to_string(),
            None,
            None,
            Some(false),
        )
        .expect("edit");

        assert_eq!(
            fs::read_to_string(temp.join("sample.txt")).expect("read"),
            "a\nb\nx\n"
        );
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn replaces_entire_file() {
        let temp = temp_workspace("entire");
        fs::write(temp.join("sample.txt"), "a\nb\n").expect("seed");

        tool_replace_lines(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            1,
            2,
            "x\ny".to_string(),
            None,
            None,
            Some(false),
        )
        .expect("edit");

        assert_eq!(
            fs::read_to_string(temp.join("sample.txt")).expect("read"),
            "x\ny\n"
        );
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn deletes_lines_with_empty_content() {
        let temp = temp_workspace("delete");
        fs::write(temp.join("sample.txt"), "a\nb\nc\n").expect("seed");

        tool_replace_lines(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            2,
            2,
            "".to_string(),
            None,
            None,
            Some(false),
        )
        .expect("edit");

        assert_eq!(
            fs::read_to_string(temp.join("sample.txt")).expect("read"),
            "a\nc\n"
        );
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn preserves_crlf_line_endings() {
        let temp = temp_workspace("crlf");
        fs::write(temp.join("sample.txt"), "a\r\nb\r\nc\r\n").expect("seed");

        tool_replace_lines(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            2,
            2,
            "x".to_string(),
            None,
            None,
            Some(false),
        )
        .expect("edit");

        assert_eq!(
            fs::read(temp.join("sample.txt")).expect("read"),
            b"a\r\nx\r\nc\r\n"
        );
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_start_line_zero() {
        let temp = temp_workspace("zero");
        fs::write(temp.join("sample.txt"), "a\n").expect("seed");

        let error = tool_replace_lines(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            0,
            1,
            "x".to_string(),
            None,
            None,
            Some(false),
        )
        .expect_err("zero");

        assert_eq!(error.code, "invalid_range");
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_start_gt_end() {
        let temp = temp_workspace("reversed");
        fs::write(temp.join("sample.txt"), "a\nb\n").expect("seed");

        let error = tool_replace_lines(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            3,
            2,
            "x".to_string(),
            None,
            None,
            Some(false),
        )
        .expect_err("reversed");

        assert_eq!(error.code, "invalid_range");
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_exceeding_file_length() {
        let temp = temp_workspace("exceed");
        fs::write(temp.join("sample.txt"), "a\nb\n").expect("seed");

        let error = tool_replace_lines(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            1,
            10,
            "x".to_string(),
            None,
            None,
            Some(false),
        )
        .expect_err("exceed");

        assert_eq!(error.code, "invalid_range");
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn handles_file_without_trailing_newline() {
        let temp = temp_workspace("notrail");
        fs::write(temp.join("sample.txt"), "a\nb\nc").expect("seed");

        tool_replace_lines(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            2,
            2,
            "x".to_string(),
            None,
            None,
            Some(false),
        )
        .expect("edit");

        assert_eq!(
            fs::read_to_string(temp.join("sample.txt")).expect("read"),
            "a\nx\nc"
        );
        let _ = fs::remove_dir_all(temp);
    }
}
