use std::fs;
use std::path::PathBuf;

use serde::Serialize;

use super::text_file::{
    decode_text, detect_binary, detect_secrets, guess_text_mime_type, is_gitignored,
    read_binary_sample, sha256_hex, TextFileToolError, MAX_READ_BYTES,
};
use super::workspace_path::{format_error_path, resolve_workspace_write_path, workspace_relative_path};

const DEFAULT_MAX_LINES: u32 = 500;
const ABSOLUTE_MAX_LINES: u32 = 1000;
const MAX_OUTPUT_BYTES: usize = 256 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileResult {
    pub path: String,
    pub encoding: String,
    pub mime_type: String,
    pub sha256: String,
    pub total_lines: u32,
    pub start_line: u32,
    pub end_line: u32,
    pub truncated: bool,
    pub contains_secrets: bool,
    pub content: String,
}

pub type ReadFileToolError = TextFileToolError;

pub fn tool_read_file(
    workspace_dir: String,
    path: String,
    start_line: Option<u32>,
    max_lines: Option<u32>,
    respect_gitignore: Option<bool>,
    numbered: Option<bool>,
) -> Result<ReadFileResult, ReadFileToolError> {
    let workspace = PathBuf::from(workspace_dir.trim());
    if workspace.as_os_str().is_empty() {
        return Err(ReadFileToolError::new(
            "workspace_required",
            "workspaceDir is required",
        ));
    }

    let start_line = start_line.unwrap_or(1).max(1);
    let max_lines = max_lines
        .unwrap_or(DEFAULT_MAX_LINES)
        .clamp(1, ABSOLUTE_MAX_LINES);
    let respect_gitignore = respect_gitignore.unwrap_or(true);
    let numbered = numbered.unwrap_or(true);

    let canonical_workspace = workspace
        .canonicalize()
        .map_err(|error| ReadFileToolError::new("invalid_workspace", error.to_string()))?;
    let target = resolve_workspace_write_path(&workspace, &path)
        .map_err(|error| ReadFileToolError::new("invalid_path", error))?;

    if !target.exists() {
        return Err(ReadFileToolError::new(
            "path_not_found",
            format!(
                "Path not found: {}",
                format_error_path(&canonical_workspace, &target, &path)
            ),
        ));
    }
    if target.is_dir() {
        return Err(ReadFileToolError::new(
            "is_directory",
            format!(
                "Path is a directory, not a file: {}",
                format_error_path(&canonical_workspace, &target, &path)
            ),
        ));
    }

    let metadata = fs::metadata(&target).map_err(|error| {
        ReadFileToolError::new("io_error", format!("Failed to read file metadata: {error}"))
    })?;
    let file_size = metadata.len();

    if file_size > MAX_READ_BYTES {
        return Err(ReadFileToolError {
            code: "file_too_large".to_string(),
            message: format!(
                "File exceeds the {MAX_READ_BYTES} byte read limit ({file_size} bytes)"
            ),
            mime_type: None,
            size: Some(file_size),
            file_snippet_hex: None,
        });
    }

    if respect_gitignore && is_gitignored(&canonical_workspace, &target)? {
        return Err(ReadFileToolError::new(
            "gitignored",
            "Path is ignored by .gitignore",
        ));
    }

    let sample = read_binary_sample(&target)?;
    if let Some(mime_type) = detect_binary(&sample) {
        return Err(ReadFileToolError {
            code: "binary_file".to_string(),
            message: format!("Binary file detected ({mime_type})"),
            mime_type: Some(mime_type),
            size: Some(file_size),
            file_snippet_hex: None,
        });
    }

    let bytes = fs::read(&target).map_err(|error| {
        ReadFileToolError::new("io_error", format!("Failed to read file: {error}"))
    })?;
    let (text, encoding) = decode_text(&bytes).ok_or_else(|| {
        ReadFileToolError::new(
            "unsupported_encoding",
            "Could not decode file with supported text encodings",
        )
    })?;

    let relative_path = workspace_relative_path(&canonical_workspace, &target);
    let mime_type = guess_text_mime_type(&relative_path);
    let contains_secrets = detect_secrets(&text);
    let total_line_count = text.lines().count() as u32;
    if total_line_count > 0 && start_line > total_line_count {
        return Err(ReadFileToolError::new(
            "invalid_range",
            format!(
                "start_line ({start_line}) exceeds file line count ({total_line_count})"
            ),
        ));
    }
    let (total_lines, selected_lines, truncated_by_lines) =
        select_lines(&text, start_line, max_lines);
    let (content, truncated_by_bytes) = if numbered {
        format_numbered_content(start_line, &selected_lines, MAX_OUTPUT_BYTES)
    } else {
        format_raw_content(&selected_lines, MAX_OUTPUT_BYTES)
    };
    let end_line = if selected_lines.is_empty() {
        start_line.saturating_sub(1)
    } else {
        start_line + selected_lines.len() as u32 - 1
    };

    Ok(ReadFileResult {
        path: relative_path,
        encoding: encoding.to_string(),
        mime_type,
        sha256: sha256_hex(&bytes),
        total_lines,
        start_line,
        end_line,
        truncated: truncated_by_lines || truncated_by_bytes,
        contains_secrets,
        content,
    })
}

fn select_lines(text: &str, start_line: u32, max_lines: u32) -> (u32, Vec<String>, bool) {
    let all_lines: Vec<String> = text.lines().map(str::to_string).collect();
    let total_lines = all_lines.len() as u32;

    if total_lines == 0 || start_line > total_lines {
        return (total_lines, Vec::new(), false);
    }

    let start_index = (start_line - 1) as usize;
    let end_index = (start_index + max_lines as usize).min(all_lines.len());
    let selected = all_lines[start_index..end_index].to_vec();
    let truncated = end_index < all_lines.len();

    (total_lines, selected, truncated)
}

fn format_raw_content(lines: &[String], max_bytes: usize) -> (String, bool) {
    let mut content = String::new();
    let mut truncated = false;

    for (index, line) in lines.iter().enumerate() {
        let segment = if index == 0 {
            line.clone()
        } else {
            format!("\n{line}")
        };
        if content.len() + segment.len() > max_bytes {
            truncated = true;
            break;
        }
        content.push_str(&segment);
    }

    (content, truncated)
}

fn format_numbered_content(start_line: u32, lines: &[String], max_bytes: usize) -> (String, bool) {
    let mut content = String::new();
    let mut truncated = false;

    for (offset, line) in lines.iter().enumerate() {
        let line_number = start_line + offset as u32;
        let segment = format!("{line_number} | {line}\n");
        if content.len() + segment.len() > max_bytes {
            truncated = true;
            break;
        }
        content.push_str(&segment);
    }

    (content, truncated)
}

#[cfg(test)]
mod tests {
    use super::super::text_file::{decode_text, detect_binary, detect_secrets};
    use super::{format_numbered_content, select_lines, tool_read_file};
    use std::fs;
    use std::path::PathBuf;

    fn temp_workspace(name: &str) -> PathBuf {
        let temp = std::env::temp_dir().join(format!(
            "coder-read-file-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&temp).expect("create temp dir");
        temp
    }

    #[test]
    fn reports_workspace_relative_path_when_file_missing() {
        let temp = temp_workspace("missing");
        let error = tool_read_file(
            temp.to_string_lossy().into_owned(),
            "missing.txt".to_string(),
            None,
            None,
            Some(false),
            None,
        )
        .expect_err("missing file");

        assert_eq!(error.code, "path_not_found");
        assert_eq!(error.message, "Path not found: missing.txt");
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn reads_requested_line_range_with_numbers() {
        let temp = temp_workspace("range");
        fs::write(temp.join("sample.txt"), "alpha\nbeta\ngamma\ndelta\n").expect("write file");

        let result = tool_read_file(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            Some(2),
            Some(2),
            Some(false),
            None,
        )
        .expect("read file");

        assert_eq!(result.path, "sample.txt");
        assert_eq!(result.encoding, "utf-8");
        assert_eq!(result.total_lines, 4);
        assert_eq!(result.start_line, 2);
        assert_eq!(result.end_line, 3);
        assert!(result.truncated);
        assert_eq!(result.content, "2 | beta\n3 | gamma\n");
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_start_line_past_end_of_file() {
        let temp = temp_workspace("invalid-start");
        fs::write(temp.join("sample.txt"), "alpha\nbeta\ngamma\n").expect("write file");

        let error = tool_read_file(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            Some(100),
            None,
            Some(false),
            None,
        )
        .expect_err("start line out of range");

        assert_eq!(error.code, "invalid_range");
        assert!(error.message.contains("100"));
        assert!(error.message.contains("3"));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_binary_files() {
        let temp = temp_workspace("binary");
        fs::write(temp.join("image.png"), b"\x89PNG\r\n\x1a\n\x00").expect("write binary");

        let error = tool_read_file(
            temp.to_string_lossy().into_owned(),
            "image.png".to_string(),
            None,
            None,
            Some(false),
            None,
        )
        .expect_err("binary file");

        assert_eq!(error.code, "binary_file");
        assert_eq!(error.mime_type.as_deref(), Some("image/png"));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn respects_gitignore_by_default() {
        let temp = temp_workspace("gitignore");
        fs::write(temp.join(".gitignore"), "ignored.txt\n").expect("write gitignore");
        fs::write(temp.join("ignored.txt"), "secret").expect("write ignored");
        fs::write(temp.join("visible.txt"), "ok").expect("write visible");

        let ignored = tool_read_file(
            temp.to_string_lossy().into_owned(),
            "ignored.txt".to_string(),
            None,
            None,
            None,
            None,
        )
        .expect_err("ignored file");
        assert_eq!(ignored.code, "gitignored");

        let visible = tool_read_file(
            temp.to_string_lossy().into_owned(),
            "visible.txt".to_string(),
            None,
            None,
            None,
            None,
        )
        .expect("visible file");
        assert_eq!(visible.content, "1 | ok\n");
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn returns_raw_content_when_numbering_disabled() {
        let temp = temp_workspace("raw");
        fs::write(temp.join("sample.txt"), "alpha\nbeta\n").expect("write file");

        let result = tool_read_file(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            None,
            None,
            Some(false),
            Some(false),
        )
        .expect("read file");

        assert_eq!(result.content, "alpha\nbeta");
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn detects_secrets_marker() {
        assert!(detect_secrets("export OPENAI_API_KEY=sk-test"));
        assert!(!detect_secrets("hello world"));
    }

    #[test]
    fn decodes_utf8_text() {
        let (text, encoding) = decode_text(b"hello").expect("decode");
        assert_eq!(text, "hello");
        assert_eq!(encoding, "utf-8");
    }

    #[test]
    fn detects_png_as_binary() {
        assert_eq!(
            detect_binary(b"\x89PNG\r\n\x1a\n\x00"),
            Some("image/png".to_string())
        );
    }

    #[test]
    fn formats_numbered_content_with_byte_limit() {
        let lines = vec!["a".repeat(100); 10];
        let (content, truncated) = format_numbered_content(1, &lines, 120);
        assert!(truncated);
        assert!(content.len() <= 120);
    }

    #[test]
    fn marks_truncation_when_more_lines_exist() {
        let (total, selected, truncated) = select_lines("a\nb\nc\n", 1, 2);
        assert_eq!(total, 3);
        assert_eq!(selected.len(), 2);
        assert!(truncated);
    }
}
