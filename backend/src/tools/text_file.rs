use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use encoding_rs::{GB18030, SHIFT_JIS, UTF_16BE, UTF_16LE};
use ignore::gitignore::{Gitignore, GitignoreBuilder};
use serde::Serialize;
use sha2::{Digest, Sha256};

pub const MAX_WRITE_BYTES: usize = 1024 * 1024;
pub const MAX_READ_BYTES: u64 = 50 * 1024 * 1024;
pub const BINARY_SAMPLE_BYTES: usize = 4096;
pub const BINARY_RATIO_THRESHOLD: f64 = 0.30;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LineEnding {
    Lf,
    CrLf,
    Cr,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextFileToolError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_snippet_hex: Option<String>,
}

impl std::fmt::Display for TextFileToolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl TextFileToolError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            mime_type: None,
            size: None,
            file_snippet_hex: None,
        }
    }

    /// Construct a `string_not_found` error for an unmatched edit target.
    pub fn string_not_found(_old_string: &str, _file_content: &str) -> Self {
        Self {
            code: "string_not_found".to_string(),
            message: format!(
                "old_string was not found in the file. \
                 This is likely because double quotes or backslashes inside \
                 the string were incorrectly escaped during JSON serialization. \
                 Re-read the file and try again, ensuring characters like \
                 `\"` and `\\` are escaped only once."
            ),
            mime_type: None,
            size: None,
            file_snippet_hex: None,
        }
    }
}

pub fn read_binary_sample(path: &Path) -> Result<Vec<u8>, TextFileToolError> {
    let mut file = File::open(path).map_err(|error| {
        TextFileToolError::new("io_error", format!("Failed to open file: {error}"))
    })?;
    let mut sample = vec![0_u8; BINARY_SAMPLE_BYTES];
    let read = file.read(&mut sample).map_err(|error| {
        TextFileToolError::new("io_error", format!("Failed to sample file: {error}"))
    })?;
    sample.truncate(read);
    Ok(sample)
}

pub fn detect_binary(sample: &[u8]) -> Option<String> {
    if sample.is_empty() {
        return None;
    }

    if sample.contains(&0) {
        return Some(detect_mime_from_magic(sample));
    }

    let non_text = sample
        .iter()
        .filter(|byte| matches!(**byte, 0..=8 | 11..=12 | 14..=31 | 127))
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

pub fn decode_text(bytes: &[u8]) -> Option<(String, &'static str)> {
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

pub fn encode_text(text: &str, encoding: &str) -> Result<Vec<u8>, TextFileToolError> {
    match encoding {
        "utf-8" => Ok(text.as_bytes().to_vec()),
        "utf-8-sig" => {
            let mut bytes = vec![0xEF, 0xBB, 0xBF];
            bytes.extend_from_slice(text.as_bytes());
            Ok(bytes)
        }
        "utf-16le" => {
            let mut bytes = vec![0xFF, 0xFE];
            for unit in text.encode_utf16() {
                bytes.extend_from_slice(&unit.to_le_bytes());
            }
            Ok(bytes)
        }
        "utf-16be" => {
            let mut bytes = vec![0xFE, 0xFF];
            for unit in text.encode_utf16() {
                bytes.extend_from_slice(&unit.to_be_bytes());
            }
            Ok(bytes)
        }
        "gb18030" => {
            let (encoded, _, had_errors) = GB18030.encode(text);
            if had_errors {
                return Err(TextFileToolError::new(
                    "unsupported_encoding",
                    "Could not encode content as gb18030",
                ));
            }
            Ok(encoded.into_owned())
        }
        "shift-jis" => {
            let (encoded, _, had_errors) = SHIFT_JIS.encode(text);
            if had_errors {
                return Err(TextFileToolError::new(
                    "unsupported_encoding",
                    "Could not encode content as shift-jis",
                ));
            }
            Ok(encoded.into_owned())
        }
        _ => Err(TextFileToolError::new(
            "unsupported_encoding",
            format!("Unsupported encoding: {encoding}"),
        )),
    }
}

pub fn detect_line_ending(text: &str) -> LineEnding {
    let mut crlf = 0usize;
    let mut lf = 0usize;
    let mut cr = 0usize;

    let bytes = text.as_bytes();
    let mut index = 0usize;
    while index < bytes.len() {
        if bytes[index] == b'\r' {
            if index + 1 < bytes.len() && bytes[index + 1] == b'\n' {
                crlf += 1;
                index += 2;
                continue;
            }
            cr += 1;
            index += 1;
            continue;
        }
        if bytes[index] == b'\n' {
            lf += 1;
        }
        index += 1;
    }

    if crlf >= lf && crlf >= cr && crlf > 0 {
        return LineEnding::CrLf;
    }
    if cr > lf && cr > 0 {
        return LineEnding::Cr;
    }
    LineEnding::Lf
}

pub fn normalize_line_endings(text: &str, ending: LineEnding) -> String {
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    match ending {
        LineEnding::Lf => normalized,
        LineEnding::CrLf => normalized.replace('\n', "\r\n"),
        LineEnding::Cr => normalized.replace('\n', "\r"),
    }
}

pub fn count_lines(text: &str) -> u32 {
    if text.is_empty() {
        return 0;
    }
    text.lines().count() as u32
}

/// Counts the number of added and removed lines between two texts.
/// Uses a proper Myers diff algorithm so inserted/deleted lines in the
/// middle of a file don't misalign all subsequent lines.
pub fn count_line_diff(before: &str, after: &str) -> (u32, u32) {
    use similar::{ChangeTag, TextDiff};

    let diff = TextDiff::from_lines(before, after);
    let mut added = 0u32;
    let mut removed = 0u32;

    for change in diff.iter_all_changes() {
        match change.tag() {
            ChangeTag::Equal => {}
            ChangeTag::Insert => added += 1,
            ChangeTag::Delete => removed += 1,
        }
    }

    (added, removed)
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn is_gitignored(workspace: &Path, target: &Path) -> Result<bool, TextFileToolError> {
    let gitignore = build_gitignore(workspace).map_err(|error| {
        TextFileToolError::new(
            "gitignore_error",
            format!("Failed to load .gitignore: {error}"),
        )
    })?;
    let relative = target
        .strip_prefix(workspace)
        .map_err(|_| TextFileToolError::new("invalid_path", "Path is outside workspace"))?;

    Ok(gitignore.matched(relative, false).is_ignore())
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

pub fn detect_secrets(text: &str) -> bool {
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

pub fn is_sensitive_path(path: &str) -> bool {
    let normalized = path.replace('\\', "/");
    let file_name = Path::new(&normalized)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("");

    if file_name == ".env" {
        return true;
    }
    if file_name.starts_with(".env.")
        && file_name != ".env.example"
        && file_name != ".env.sample"
        && file_name != ".env.template"
    {
        return true;
    }
    if matches!(file_name, "id_rsa" | "id_ed25519" | "id_dsa" | "id_ecdsa") {
        return true;
    }
    if normalized.ends_with(".pem")
        || normalized.ends_with(".p12")
        || normalized.ends_with(".kube/config")
        || normalized.ends_with("/.kube/config")
    {
        return true;
    }

    false
}

pub fn guess_image_mime_type(path: &str, sample: &[u8]) -> Option<String> {
    let magic = detect_mime_from_magic(sample);
    if magic.starts_with("image/") {
        return Some(magic);
    }

    match Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("avif") => Some("image/avif".to_string()),
        Some("bmp") => Some("image/bmp".to_string()),
        Some("gif") => Some("image/gif".to_string()),
        Some("heic") => Some("image/heic".to_string()),
        Some("heif") => Some("image/heif".to_string()),
        Some("jpg") | Some("jpeg") => Some("image/jpeg".to_string()),
        Some("png") => Some("image/png".to_string()),
        Some("svg") => Some("image/svg+xml".to_string()),
        Some("webp") => Some("image/webp".to_string()),
        _ => None,
    }
}

pub fn guess_text_mime_type(path: &str) -> String {
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

pub fn atomic_write_bytes(
    path: &Path,
    bytes: &[u8],
    _preserve_mode: Option<u32>,
) -> Result<(), TextFileToolError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            TextFileToolError::new(
                "io_error",
                format!("Failed to create parent directories: {error}"),
            )
        })?;
    }

    let tmp_path = temporary_write_path(path);
    {
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&tmp_path)
            .map_err(|error| {
                TextFileToolError::new("io_error", format!("Failed to open temp file: {error}"))
            })?;
        file.write_all(bytes).map_err(|error| {
            TextFileToolError::new("io_error", format!("Failed to write temp file: {error}"))
        })?;
        file.sync_all().map_err(|error| {
            TextFileToolError::new("io_error", format!("Failed to sync temp file: {error}"))
        })?;
    }

    #[cfg(unix)]
    if let Some(mode) = _preserve_mode {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&tmp_path, fs::Permissions::from_mode(mode)).map_err(|error| {
            TextFileToolError::new(
                "io_error",
                format!("Failed to set file permissions: {error}"),
            )
        })?;
    }

    fs::rename(&tmp_path, path).map_err(|error| {
        let _ = fs::remove_file(&tmp_path);
        TextFileToolError::new("io_error", format!("Failed to replace file: {error}"))
    })?;

    Ok(())
}

fn temporary_write_path(path: &Path) -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("file");
    path.with_file_name(format!("{file_name}.{nanos}.tmp"))
}

pub fn apply_text_replacement(
    content: &str,
    old_string: &str,
    new_string: &str,
    replace_all: bool,
) -> Result<String, TextFileToolError> {
    if old_string.is_empty() {
        return Err(TextFileToolError::new(
            "invalid_arguments",
            "old_string must not be empty",
        ));
    }

    let ending = detect_line_ending(content);
    let content_lf = normalize_line_endings(content, LineEnding::Lf);
    let old_lf = normalize_line_endings(old_string, LineEnding::Lf);
    let new_lf = normalize_line_endings(new_string, LineEnding::Lf);

    let count = content_lf.matches(&old_lf).count();
    if count == 0 {
        // Fallback: if old_string contains JSON escape sequences (e.g. \")
        // that likely resulted from double-escaping in the LLM tool call,
        // try unescaping once and match again.
        let unescaped = unescape_json_string(&old_lf);
        let fallback_count = if unescaped != old_lf {
            content_lf.matches(&unescaped).count()
        } else {
            0
        };
        if fallback_count > 0 {
            // Use the unescaped version for replacement.
            let updated_lf = if replace_all {
                content_lf.replace(&unescaped, &new_lf)
            } else {
                content_lf.replacen(&unescaped, &new_lf, 1)
            };
            return Ok(normalize_line_endings(&updated_lf, ending));
        }
        return Err(TextFileToolError::string_not_found(old_string, content));
    }
    if !replace_all && count > 1 {
        return Err(TextFileToolError::new(
            "multiple_matches",
            format!(
                "old_string matched {count} locations; set replace_all to true or provide a more specific string"
            ),
        ));
    }

    let updated_lf = if replace_all {
        content_lf.replace(&old_lf, &new_lf)
    } else {
        content_lf.replacen(&old_lf, &new_lf, 1)
    };

    Ok(normalize_line_endings(&updated_lf, ending))
}

/// Apply single-level JSON unescaping to recover from double-escaped
/// LLM tool-call arguments. Only handles the common cases:
///   `\"` → `"`,  `\\` → `\`,  `\n` → newline,  `\t` → tab,  `\/` → `/`
fn unescape_json_string(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '\\' {
            match chars.next() {
                Some('"') => result.push('"'),
                Some('\\') => result.push('\\'),
                Some('n') => result.push('\n'),
                Some('t') => result.push('\t'),
                Some('/') => result.push('/'),
                Some(other) => {
                    result.push('\\');
                    result.push(other);
                }
                None => result.push('\\'),
            }
        } else {
            result.push(c);
        }
    }
    result
}

/// Copies the file into `.history/` before a write. Reserved for future rollback/undo;
/// disabled by default in `edit_file` / `replace_file` until that UX ships.
pub fn create_backup(
    workspace: &Path,
    source: &Path,
    relative_path: &str,
) -> Result<String, TextFileToolError> {
    let history_dir = workspace.join(".history");
    fs::create_dir_all(&history_dir).map_err(|error| {
        TextFileToolError::new(
            "io_error",
            format!("Failed to create backup directory: {error}"),
        )
    })?;

    let safe_name = relative_path.replace('/', "__");
    let mut sequence = 1u32;
    loop {
        let backup_name = format!("{safe_name}.{sequence:03}");
        let backup_path = history_dir.join(&backup_name);
        if !backup_path.exists() {
            fs::copy(source, &backup_path).map_err(|error| {
                TextFileToolError::new("io_error", format!("Failed to create backup: {error}"))
            })?;
            return Ok(format!(".history/{backup_name}"));
        }
        sequence += 1;
        if sequence > 999 {
            return Err(TextFileToolError::new(
                "io_error",
                "Too many backup files for this path",
            ));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        apply_text_replacement, atomic_write_bytes, count_line_diff, count_lines, decode_text,
        detect_binary, detect_line_ending, encode_text, is_sensitive_path, normalize_line_endings,
        sha256_hex, LineEnding,
    };
    use std::fs;

    #[test]
    fn decodes_utf8_text() {
        let (text, encoding) = decode_text(b"hello").expect("decode");
        assert_eq!(text, "hello");
        assert_eq!(encoding, "utf-8");
    }

    #[test]
    fn encodes_utf8_with_bom() {
        let bytes = encode_text("hello", "utf-8-sig").expect("encode");
        assert_eq!(&bytes[..3], &[0xEF, 0xBB, 0xBF]);
    }

    #[test]
    fn detects_png_as_binary() {
        assert_eq!(
            detect_binary(b"\x89PNG\r\n\x1a\n\x00"),
            Some("image/png".to_string())
        );
    }

    #[test]
    fn detects_crlf_line_endings() {
        assert_eq!(detect_line_ending("a\r\nb\n"), LineEnding::CrLf);
    }

    #[test]
    fn normalizes_to_crlf() {
        assert_eq!(
            normalize_line_endings("a\nb\r\nc\n", LineEnding::CrLf),
            "a\r\nb\r\nc\r\n"
        );
    }

    #[test]
    fn counts_line_diff_changed_line() {
        let (added, removed) = count_line_diff("a\nb\n", "a\nc\n");
        assert_eq!(added, 1);
        assert_eq!(removed, 1);
    }

    #[test]
    fn counts_line_diff_insert_middle() {
        // Previously this would give +51 -50 due to positional comparison
        let before = (0..100).map(|i| format!("line{i}")).collect::<Vec<_>>().join("\n");
        let mut after_lines: Vec<String> = (0..100).map(|i| format!("line{i}")).collect();
        after_lines.insert(50, "NEW LINE".to_string());
        let after = after_lines.join("\n");
        let (added, removed) = count_line_diff(&before, &after);
        assert_eq!(added, 1, "one line inserted");
        assert_eq!(removed, 0, "no lines removed");
    }

    #[test]
    fn counts_line_diff_delete_middle() {
        // Previously this would give +0 -51 due to positional comparison
        let before = (0..101).map(|i| format!("line{i}")).collect::<Vec<_>>().join("\n");
        let mut after_lines: Vec<String> = (0..101).map(|i| format!("line{i}")).collect();
        after_lines.remove(50);
        let after = after_lines.join("\n");
        let (added, removed) = count_line_diff(&before, &after);
        assert_eq!(added, 0, "no lines added");
        assert_eq!(removed, 1, "one line removed");
    }

    #[test]
    fn counts_line_diff_insert_and_modify() {
        // Insert + modify one existing line
        let before = "a\nb\nc\n";
        let after = "a\nx\nb\nc\n";
        let (added, removed) = count_line_diff(before, after);
        assert_eq!(added, 1, "one line added");
        assert_eq!(removed, 0, "no lines removed (no deletes)");
    }

    #[test]
    fn counts_lines_in_text() {
        assert_eq!(count_lines("a\nb\n"), 2);
        assert_eq!(count_lines(""), 0);
    }

    #[test]
    fn hashes_bytes() {
        assert_eq!(
            sha256_hex(b"hello"),
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        );
    }

    #[test]
    fn flags_sensitive_paths() {
        assert!(is_sensitive_path(".env"));
        assert!(is_sensitive_path("secrets/id_rsa"));
        assert!(!is_sensitive_path(".env.example"));
    }

    #[test]
    fn applies_single_replacement() {
        let updated = apply_text_replacement("foo bar", "bar", "baz", false).expect("replace");
        assert_eq!(updated, "foo baz");
    }

    #[test]
    fn rejects_multiple_replacements_by_default() {
        let error = apply_text_replacement("foo foo", "foo", "bar", false).expect_err("multiple");
        assert_eq!(error.code, "multiple_matches");
    }

    #[test]
    fn atomic_write_creates_file() {
        let temp = std::env::temp_dir().join(format!(
            "coder-text-file-atomic-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&temp).expect("create temp");
        let target = temp.join("sample.txt");
        atomic_write_bytes(&target, b"hello", None).expect("write");
        assert_eq!(fs::read(&target).expect("read"), b"hello");
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn unescapes_json_double_quotes() {
        assert_eq!(super::unescape_json_string(r#"foo \"bar\""#), "foo \"bar\"");
    }

    #[test]
    fn unescapes_json_backslashes() {
        assert_eq!(super::unescape_json_string(r#"a\\b"#), "a\\b");
    }

    #[test]
    fn unescapes_json_newlines() {
        assert_eq!(super::unescape_json_string("line1\\nline2"), "line1\nline2");
    }

    #[test]
    fn unescapes_json_tabs() {
        assert_eq!(super::unescape_json_string("col1\\tcol2"), "col1\tcol2");
    }

    #[test]
    fn unescapes_noop_for_plain_text() {
        assert_eq!(super::unescape_json_string("hello world"), "hello world");
    }

    #[test]
    fn fallback_handles_double_escaped_quotes() {
        // old_string contains \" (double-escaped), file has " (just quote)
        let updated = apply_text_replacement(
            r#"let msg = "hello";"#,
            r#"let msg = \"hello\";"#,
            "let msg = \"hi\";",
            false,
        )
        .expect("fallback should match");
        assert_eq!(updated, "let msg = \"hi\";");
    }

    #[test]
    fn fallback_passes_through_exact_match() {
        // When old_string matches exactly, fallback is not needed
        let updated = apply_text_replacement("foo bar", "bar", "baz", false).expect("exact match");
        assert_eq!(updated, "foo baz");
    }
}
