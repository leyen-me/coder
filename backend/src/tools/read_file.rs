use std::fs;
use std::path::PathBuf;

use base64::Engine;
use serde::Serialize;

use super::text_file::{
    decode_text, detect_binary, guess_image_mime_type, guess_text_mime_type, read_binary_sample,
    sha256_hex, TextFileToolError, MAX_READ_BYTES,
};
use super::workspace_path::{
    format_error_path, resolve_workspace_write_path_unbounded, workspace_relative_path,
};

const DEFAULT_MAX_LINES: u32 = 1000;
const ABSOLUTE_MAX_LINES: u32 = 2000;
const MAX_OUTPUT_BYTES: usize = 256 * 1024;
/// Images are binary and never go through line-based truncation. A generous
/// cap keeps a single read from bloating the model context; larger images
/// should be resized or downsampled by the agent first.
const MAX_IMAGE_READ_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileResult {
    pub path: String,
    pub encoding: String,
    pub mime_type: String,
    pub sha256: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_data_url: Option<String>,
    pub total_lines: u32,
    pub start_line: u32,
    pub end_line: u32,
    pub truncated: bool,
    pub content: String,
}

impl ReadFileResult {
    /// True when this result carries a multimodal image payload (base64 data
    /// URL) that should be fed to the model as vision input rather than shown
    /// as text.
    pub fn is_image(&self) -> bool {
        self.image_data_url.is_some()
    }
}

pub type ReadFileToolError = TextFileToolError;

pub fn tool_read_file(
    workspace_dir: String,
    path: String,
    start_line: Option<u32>,
    max_lines: Option<u32>,
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
    let numbered = numbered.unwrap_or(true);

    let canonical_workspace = workspace
        .canonicalize()
        .map_err(|error| ReadFileToolError::new("invalid_workspace", error.to_string()))?;
    let target = resolve_workspace_write_path_unbounded(&workspace, &path)
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

    let sample = read_binary_sample(&target)?;
    // If the file is an image, return it as a multimodal vision input so the
    // model can actually "see" it — the same way a pasted image reaches the
    // model. Any other binary file is still rejected.
    if let Some(image_mime) = guess_image_mime_type(&path, &sample) {
        return read_image_result(&canonical_workspace, &target, &image_mime, file_size);
    }
    if let Some(mime_type) = detect_binary(&sample) {
        return Err(ReadFileToolError {
            code: "binary_file".to_string(),
            message: format!(
                "Binary file detected ({mime_type}). read_file only supports text files and images; do not use it for other binary files."
            ),
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
        format_numbered_content(start_line, &selected_lines, total_lines, MAX_OUTPUT_BYTES)
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
        image_data_url: None,
        total_lines,
        start_line,
        end_line,
        truncated: truncated_by_lines || truncated_by_bytes,
        content,
    })
}

/// Reads an image file and returns it as a base64 data URL so the model can
/// consume it as vision input. Large images are rejected instead of being
/// allowed to bloat the context window.
fn read_image_result(
    canonical_workspace: &PathBuf,
    target: &PathBuf,
    mime_type: &str,
    file_size: u64,
) -> Result<ReadFileResult, ReadFileToolError> {
    if file_size > MAX_IMAGE_READ_BYTES {
        return Err(ReadFileToolError {
            code: "file_too_large".to_string(),
            message: format!(
                "Image exceeds the {MAX_IMAGE_READ_BYTES} byte read limit ({file_size} bytes); resize or downsample it before reading."
            ),
            mime_type: Some(mime_type.to_string()),
            size: Some(file_size),
            file_snippet_hex: None,
        });
    }

    let bytes = fs::read(target).map_err(|error| {
        ReadFileToolError::new("io_error", format!("Failed to read image file: {error}"))
    })?;
    let relative_path = workspace_relative_path(canonical_workspace, target);
    let data_url = format!(
        "data:{mime_type};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&bytes)
    );

    Ok(ReadFileResult {
        path: relative_path,
        encoding: String::from("binary"),
        mime_type: mime_type.to_string(),
        sha256: sha256_hex(&bytes),
        image_data_url: Some(data_url),
        total_lines: 0,
        start_line: 1,
        end_line: 0,
        truncated: false,
        content: String::new(),
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

fn format_numbered_content(
    start_line: u32,
    lines: &[String],
    total_lines: u32,
    max_bytes: usize,
) -> (String, bool) {
    let mut content = String::new();
    let mut truncated = false;

    // Right-align line numbers to the width of the file's total line count so
    // the ` | ` separator and content stay in fixed columns regardless of how
    // many digits a given line number has.
    let width = total_lines.to_string().len().max(1);

    for (offset, line) in lines.iter().enumerate() {
        let line_number = start_line + offset as u32;
        let segment = format!("{ln:>width$} | {line}\n", ln = line_number, width = width, line = line);
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
            None,
        )
        .expect_err("start line out of range");

        assert_eq!(error.code, "invalid_range");
        assert!(error.message.contains("100"));
        assert!(error.message.contains("3"));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn reads_image_file_as_multimodal_vision_input() {
        let temp = temp_workspace("image-read");
        // A PNG with its magic bytes is now detected as an image and returned
        // to the model as vision input instead of being rejected as binary.
        fs::write(temp.join("image.png"), b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR").expect("write image");

        let result = tool_read_file(
            temp.to_string_lossy().into_owned(),
            "image.png".to_string(),
            None,
            None,
            None,
        )
        .expect("read image");

        assert_eq!(result.mime_type, "image/png");
        assert!(result.is_image(), "should be flagged as an image result");
        let url = result.image_data_url.as_deref().expect("image data url");
        assert!(url.starts_with("data:image/png;base64,"), "url prefix: {url}");
        assert_eq!(result.encoding, "binary");
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_non_image_binary_files() {
        let temp = temp_workspace("binary");
        // A ZIP archive (PK\x03\x04 magic) is not an image, so it is still
        // rejected as a binary file.
        fs::write(temp.join("archive.zip"), b"PK\x03\x04\x00\x00\x00\x00").expect("write binary");

        let error = tool_read_file(
            temp.to_string_lossy().into_owned(),
            "archive.zip".to_string(),
            None,
            None,
            None,
        )
        .expect_err("binary file");

        assert_eq!(error.code, "binary_file");
        assert_eq!(error.mime_type.as_deref(), Some("application/zip"));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn reads_gitignored_file_despite_gitignore() {
        let temp = temp_workspace("gitignore-read");
        fs::write(temp.join(".gitignore"), "ignored.txt\n").expect("write gitignore");
        fs::write(temp.join("ignored.txt"), "secret").expect("write ignored");

        let result = tool_read_file(
            temp.to_string_lossy().into_owned(),
            "ignored.txt".to_string(),
            None,
            None,
            None,
        )
        .expect("read gitignored file");
        assert_eq!(result.content, "1 | secret\n");
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
        let (content, truncated) = format_numbered_content(1, &lines, 10, 120);
        assert!(truncated);
        assert!(content.len() <= 120);
    }

    #[test]
    fn formats_numbered_content_right_aligns_line_numbers() {
        // total_lines = 120 -> width 3, so all line numbers occupy 3 columns
        // and content starts at a fixed column.
        let lines = vec!["x".to_string(), "x".to_string(), "x".to_string()];
        let (content, _) = format_numbered_content(1, &lines, 120, usize::MAX);
        assert_eq!(
            content,
            "  1 | x\n  2 | x\n  3 | x\n"
        );
    }

    #[test]
    fn formats_numbered_content_keeps_separator_fixed_for_range() {
        // Starting at a 3-digit line, the 3-column width means no leading pad.
        let lines = vec!["x".to_string(), "x".to_string()];
        let (content, _) = format_numbered_content(100, &lines, 253, usize::MAX);
        assert_eq!(content, "100 | x\n101 | x\n");
    }

    #[test]
    fn marks_truncation_when_more_lines_exist() {
        let (total, selected, truncated) = select_lines("a\nb\nc\n", 1, 2);
        assert_eq!(total, 3);
        assert_eq!(selected.len(), 2);
        assert!(truncated);
    }

    #[test]
    fn reads_file_outside_workspace_when_unbounded() {
        let ws = temp_workspace("read-outside");
        let suffix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let outside = std::env::temp_dir().join(format!("coder-read-outside-{}", suffix));
        std::fs::create_dir_all(&outside).expect("create outside");
        let outside_file = outside.join("note.txt");
        std::fs::write(&outside_file, "hello from outside").expect("write outside");

        let result = tool_read_file(
            ws.to_string_lossy().into_owned(),
            outside_file.to_string_lossy().into_owned(),
            None,
            None,
            Some(false),
        )
        .expect("read outside workspace");
        assert!(result.content.contains("hello from outside"));

        let _ = std::fs::remove_dir_all(&outside);
        let _ = std::fs::remove_dir_all(&ws);
    }

    // ── Production-scenario tests ──
    // Mimics the real-world case that caused a model to *hallucinate*
    // `[compacted]` / `[truncated]... [N chars]` markers in tool output.
    // These tests prove the tool NEVER inserts such markers into `content`.

    fn write_540_line_file(dir: &std::path::Path, name: &str) {
        // ~35 chars/line, similar to a real .tsx source file
        let content: String = (1..=540)
            .map(|i| format!("line {i}: const item{i} = {{ id: {i} }};\n"))
            .collect();
        fs::write(dir.join(name), content).expect("write 540-line file");
    }

    fn write_n_line_file(dir: &std::path::Path, name: &str, n: u32) {
        let content: String = (1..=n)
            .map(|i| format!("line {i}: const item{i} = {{ id: {i} }};\n"))
            .collect();
        fs::write(dir.join(name), content).expect("write file");
    }

    /// 1200-line file, default max_lines (1000) → truncated by lines.
    /// Content must be exactly lines 1-1000 with NO markers.
    #[test]
    fn content_has_no_markers_when_line_truncated() {
        let temp = temp_workspace("markers-line-trunc");
        write_n_line_file(&temp, "big.tsx", 1200);

        let result = tool_read_file(
            temp.to_string_lossy().into_owned(),
            "big.tsx".to_string(),
            None,
            None, // default max_lines = 1000
            None,
        )
        .expect("read file");

        assert_eq!(result.total_lines, 1200);
        assert_eq!(result.start_line, 1);
        assert_eq!(result.end_line, 1000);
        assert!(result.truncated, "truncated=true because 1000 < 1200");
        // THE KEY ASSERTIONS — no markers anywhere in content
        assert!(!result.content.contains("[compacted]"), "content must not contain [compacted]");
        assert!(!result.content.contains("[truncated]"), "content must not contain [truncated]");
        assert!(!result.content.contains("chars]"), "content must not contain chars]");
        // Content is exactly lines 1-1000, nothing more
        assert!(result.content.contains("1 | line 1:"));
        assert!(result.content.contains("1000 | line 1000:"));
        assert!(!result.content.contains("1001 |"), "must not contain line 1001+");
        let _ = fs::remove_dir_all(temp);
    }

    /// 540-line file, max_lines=150 (mimics production parameter).
    /// Content must be exactly lines 1-150 with NO markers.
    #[test]
    fn content_has_no_markers_when_small_chunk() {
        let temp = temp_workspace("markers-small-chunk");
        write_540_line_file(&temp, "zones.tsx");

        let result = tool_read_file(
            temp.to_string_lossy().into_owned(),
            "zones.tsx".to_string(),
            Some(1),
            Some(150),
            None,
        )
        .expect("read file");

        assert_eq!(result.total_lines, 540);
        assert_eq!(result.end_line, 150);
        assert!(result.truncated, "truncated=true because 150 < 540");
        assert!(!result.content.contains("[compacted]"));
        assert!(!result.content.contains("[truncated]"));
        assert!(!result.content.contains("chars]"));
        assert!(result.content.contains("1 | line 1:"));
        assert!(result.content.contains("150 | line 150:"));
        assert!(!result.content.contains("151 |"));
        let _ = fs::remove_dir_all(temp);
    }

    /// 540-line file, max_lines=1000 → reads entire file.
    /// truncated must be false, content complete, no markers.
    #[test]
    fn full_read_has_truncated_false_and_no_markers() {
        let temp = temp_workspace("markers-full-read");
        write_540_line_file(&temp, "zones.tsx");

        let result = tool_read_file(
            temp.to_string_lossy().into_owned(),
            "zones.tsx".to_string(),
            None,
            Some(1000),
            None,
        )
        .expect("read file");

        assert_eq!(result.total_lines, 540);
        assert_eq!(result.end_line, 540);
        assert!(!result.truncated, "truncated=false because all 540 lines read");
        assert!(!result.content.contains("[compacted]"));
        assert!(!result.content.contains("[truncated]"));
        assert!(!result.content.contains("chars]"));
        assert!(result.content.contains("1 | line 1:"));
        assert!(result.content.contains("540 | line 540:"));
        let _ = fs::remove_dir_all(temp);
    }

    /// File with very long lines triggering the 256KB byte limit.
    /// Even byte-truncation must NOT insert markers into content.
    #[test]
    fn byte_truncation_does_not_insert_markers() {
        let temp = temp_workspace("markers-byte-trunc");
        // 300 lines × ~1010 chars = ~303KB > 256KB limit
        let long_line = "x".repeat(1000);
        let content: String = (1..=300)
            .map(|i| format!("line{i}:{long_line}\n"))
            .collect();
        fs::write(temp.join("big.txt"), content).expect("write big file");

        let result = tool_read_file(
            temp.to_string_lossy().into_owned(),
            "big.txt".to_string(),
            None,
            Some(300), // request all 300 lines
            None,
        )
        .expect("read file");

        assert_eq!(result.total_lines, 300);
        assert!(result.truncated, "should be truncated by 256KB byte limit");
        assert!(!result.content.contains("[compacted]"));
        assert!(!result.content.contains("[truncated]"));
        assert!(!result.content.contains("chars]"));
        let _ = fs::remove_dir_all(temp);
    }

    /// Verifies the semantic meaning of `truncated: true`:
    /// it means "more lines exist in the file", NOT "content was compressed".
    /// Content must contain exactly the requested lines, fully and completely.
    #[test]
    fn truncated_true_means_more_lines_not_compression() {
        let temp = temp_workspace("truncated-semantics");
        let content: String = (1..=540)
            .map(|i| format!("line {i}\n"))
            .collect();
        fs::write(temp.join("file.txt"), content).expect("write file");

        let result = tool_read_file(
            temp.to_string_lossy().into_owned(),
            "file.txt".to_string(),
            Some(1),
            Some(100),
            None,
        )
        .expect("read file");

        assert!(result.truncated, "truncated=true because 100 < 540");
        // Content must be EXACTLY 100 lines, complete, no markers
        let line_count = result.content.lines().count();
        assert_eq!(line_count, 100, "content must have exactly 100 lines");
        assert!(result.content.contains("1 | line 1"));
        assert!(result.content.contains("100 | line 100"));
        assert!(!result.content.contains("101 |"));
        assert!(!result.content.contains("[compacted]"));
        assert!(!result.content.contains("[truncated]"));
        assert!(!result.content.contains("chars]"));
        let _ = fs::remove_dir_all(temp);
    }

    /// Pagination: read lines 151-300 of a 540-line file.
    /// Verifies content is exactly that range, no markers.
    #[test]
    fn paginated_read_has_no_markers() {
        let temp = temp_workspace("markers-paginated");
        write_540_line_file(&temp, "zones.tsx");

        let result = tool_read_file(
            temp.to_string_lossy().into_owned(),
            "zones.tsx".to_string(),
            Some(151),
            Some(150),
            None,
        )
        .expect("read file");

        assert_eq!(result.start_line, 151);
        assert_eq!(result.end_line, 300);
        assert!(result.truncated, "truncated=true because 300 < 540");
        assert!(!result.content.contains("[compacted]"));
        assert!(!result.content.contains("[truncated]"));
        assert!(!result.content.contains("chars]"));
        assert!(result.content.contains("151 | line 151:"));
        assert!(result.content.contains("300 | line 300:"));
        assert!(!result.content.contains("150 |"));
        assert!(!result.content.contains("301 |"));
        let _ = fs::remove_dir_all(temp);
    }
}
