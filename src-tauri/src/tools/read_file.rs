use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use encoding_rs::{GB18030, SHIFT_JIS, UTF_16BE, UTF_16LE};
use ignore::gitignore::{Gitignore, GitignoreBuilder};
use serde::Serialize;

use super::workspace_path::{resolve_workspace_path, workspace_relative_path};

const DEFAULT_MAX_LINES: u32 = 500;
const ABSOLUTE_MAX_LINES: u32 = 1000;
const MAX_OUTPUT_BYTES: usize = 256 * 1024;
const MAX_READ_BYTES: u64 = 50 * 1024 * 1024;
const BINARY_SAMPLE_BYTES: usize = 4096;
const BINARY_RATIO_THRESHOLD: f64 = 0.30;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileResult {
    pub path: String,
    pub encoding: String,
    pub mime_type: String,
    pub total_lines: u32,
    pub start_line: u32,
    pub end_line: u32,
    pub truncated: bool,
    pub contains_secrets: bool,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileToolError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
}

impl ReadFileToolError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            mime_type: None,
            size: None,
        }
    }
}

#[tauri::command]
pub fn tool_read_file(
    workspace_dir: String,
    path: String,
    start_line: Option<u32>,
    max_lines: Option<u32>,
    respect_gitignore: Option<bool>,
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

    let canonical_workspace = workspace
        .canonicalize()
        .map_err(|error| ReadFileToolError::new("invalid_workspace", error.to_string()))?;
    let target = resolve_workspace_path(&workspace, &path)
        .map_err(|error| ReadFileToolError::new("invalid_path", error))?;

    if !target.exists() {
        return Err(ReadFileToolError::new(
            "path_not_found",
            format!("Path not found: {}", target.display()),
        ));
    }
    if target.is_dir() {
        return Err(ReadFileToolError::new(
            "is_directory",
            format!("Path is a directory, not a file: {}", target.display()),
        ));
    }

    let metadata = fs::metadata(&target).map_err(|error| {
        ReadFileToolError::new(
            "io_error",
            format!("Failed to read file metadata: {error}"),
        )
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
    let (total_lines, selected_lines, truncated_by_lines) =
        select_lines(&text, start_line, max_lines);
    let (content, truncated_by_bytes) =
        format_numbered_content(start_line, &selected_lines, MAX_OUTPUT_BYTES);
    let end_line = if selected_lines.is_empty() {
        start_line.saturating_sub(1)
    } else {
        start_line + selected_lines.len() as u32 - 1
    };

    Ok(ReadFileResult {
        path: relative_path,
        encoding: encoding.to_string(),
        mime_type,
        total_lines,
        start_line,
        end_line,
        truncated: truncated_by_lines || truncated_by_bytes,
        contains_secrets,
        content,
    })
}

fn read_binary_sample(path: &Path) -> Result<Vec<u8>, ReadFileToolError> {
    let mut file = fs::File::open(path).map_err(|error| {
        ReadFileToolError::new("io_error", format!("Failed to open file: {error}"))
    })?;
    let mut sample = vec![0_u8; BINARY_SAMPLE_BYTES];
    let read = file.read(&mut sample).map_err(|error| {
        ReadFileToolError::new("io_error", format!("Failed to sample file: {error}"))
    })?;
    sample.truncate(read);
    Ok(sample)
}

fn detect_binary(sample: &[u8]) -> Option<String> {
    if sample.is_empty() {
        return None;
    }

    if sample.contains(&0) {
        return Some(detect_mime_from_magic(sample));
    }

    let non_text = sample
        .iter()
        .filter(|byte| {
            matches!(**byte, 0..=8 | 11..=12 | 14..=31 | 127)
        })
        .count();
    let ratio = non_text as f64 / sample.len() as f64;
    if ratio > BINARY_RATIO_THRESHOLD {
        return Some(detect_mime_from_magic(sample));
    }

    None
}

fn detect_mime_from_magic(sample: &[u8]) -> String {
    if sample.starts_with(b"\x89PNG\r\n\x1a\n") {
        return "image/png".to_string();
    }
    if sample.starts_with(b"\xFF\xD8\xFF") {
        return "image/jpeg".to_string();
    }
    if sample.starts_with(b"GIF87a") || sample.starts_with(b"GIF89a") {
        return "image/gif".to_string();
    }
    if sample.starts_with(b"%PDF") {
        return "application/pdf".to_string();
    }
    if sample.starts_with(b"PK\x03\x04") {
        return "application/zip".to_string();
    }
    if sample.starts_with(b"\x1F\x8B") {
        return "application/gzip".to_string();
    }
    if sample.starts_with(b"SQLite format 3\0") {
        return "application/x-sqlite3".to_string();
    }

    "application/octet-stream".to_string()
}

fn decode_text(bytes: &[u8]) -> Option<(String, &'static str)> {
    if let Ok(text) = std::str::from_utf8(bytes) {
        return Some((text.to_string(), "utf-8"));
    }

    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        if let Ok(text) = std::str::from_utf8(&bytes[3..]) {
            return Some((text.to_string(), "utf-8-sig"));
        }
    }

    if bytes.starts_with(&[0xFF, 0xFE]) {
        let (text, _, _) = UTF_16LE.decode(&bytes[2..]);
        if !text.contains('\u{FFFD}') {
            return Some((text.into_owned(), "utf-16le"));
        }
    }

    if bytes.starts_with(&[0xFE, 0xFF]) {
        let (text, _, _) = UTF_16BE.decode(&bytes[2..]);
        if !text.contains('\u{FFFD}') {
            return Some((text.into_owned(), "utf-16be"));
        }
    }

    let (text, _, had_errors) = GB18030.decode(bytes);
    if !had_errors {
        return Some((text.into_owned(), "gb18030"));
    }

    let (text, _, had_errors) = SHIFT_JIS.decode(bytes);
    if !had_errors {
        return Some((text.into_owned(), "shift-jis"));
    }

    None
}

fn is_gitignored(workspace: &Path, target: &Path) -> Result<bool, ReadFileToolError> {
    let gitignore = build_gitignore(workspace).map_err(|error| {
        ReadFileToolError::new("gitignore_error", format!("Failed to load .gitignore: {error}"))
    })?;
    let relative = target
        .strip_prefix(workspace)
        .map_err(|_| ReadFileToolError::new("invalid_path", "Path is outside workspace"))?;

    Ok(gitignore
        .matched(relative, false)
        .is_ignore())
}

fn build_gitignore(workspace: &Path) -> Result<Gitignore, ignore::Error> {
    let mut builder = GitignoreBuilder::new(workspace);
    let root_gitignore = workspace.join(".gitignore");
    if root_gitignore.is_file() {
        builder.add(root_gitignore);
    }

    let exclude = workspace.join(".git").join("info").join("exclude");
    if exclude.is_file() {
        builder.add(exclude);
    }

    builder.build()
}

fn detect_secrets(text: &str) -> bool {
    const MARKERS: [&str; 6] = [
        "AWS_SECRET_ACCESS_KEY",
        "OPENAI_API_KEY",
        "DATABASE_URL",
        "PRIVATE KEY",
        "API_SECRET",
        "BEGIN RSA PRIVATE KEY",
    ];

    MARKERS.iter().any(|marker| text.contains(marker))
}

fn guess_text_mime_type(path: &str) -> String {
    match Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("py") => "text/x-python".to_string(),
        Some("rs") => "text/x-rust".to_string(),
        Some("js") => "text/javascript".to_string(),
        Some("jsx") => "text/javascript".to_string(),
        Some("ts") => "text/typescript".to_string(),
        Some("tsx") => "text/typescript".to_string(),
        Some("json") => "application/json".to_string(),
        Some("md") => "text/markdown".to_string(),
        Some("html") | Some("htm") => "text/html".to_string(),
        Some("css") => "text/css".to_string(),
        Some("yaml") | Some("yml") => "text/yaml".to_string(),
        Some("toml") => "text/toml".to_string(),
        Some("xml") => "application/xml".to_string(),
        Some("sql") => "application/sql".to_string(),
        Some("sh") => "application/x-sh".to_string(),
        _ => "text/plain".to_string(),
    }
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

fn format_numbered_content(
    start_line: u32,
    lines: &[String],
    max_bytes: usize,
) -> (String, bool) {
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
    use super::{
        decode_text, detect_binary, detect_secrets, format_numbered_content, select_lines,
        tool_read_file,
    };
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
    fn reads_requested_line_range_with_numbers() {
        let temp = temp_workspace("range");
        fs::write(
            temp.join("sample.txt"),
            "alpha\nbeta\ngamma\ndelta\n",
        )
        .expect("write file");

        let result = tool_read_file(
            temp.to_string_lossy().into_owned(),
            "sample.txt".to_string(),
            Some(2),
            Some(2),
            Some(false),
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
    fn rejects_binary_files() {
        let temp = temp_workspace("binary");
        fs::write(temp.join("image.png"), b"\x89PNG\r\n\x1a\n\x00")
            .expect("write binary");

        let error = tool_read_file(
            temp.to_string_lossy().into_owned(),
            "image.png".to_string(),
            None,
            None,
            Some(false),
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
        )
        .expect_err("ignored file");
        assert_eq!(ignored.code, "gitignored");

        let visible = tool_read_file(
            temp.to_string_lossy().into_owned(),
            "visible.txt".to_string(),
            None,
            None,
            None,
        )
        .expect("visible file");
        assert_eq!(visible.content, "1 | ok\n");
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
