use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use super::text_file::{
    self, atomic_write_bytes, count_line_diff, decode_text, detect_binary, encode_text,
    is_gitignored, is_sensitive_path, normalize_line_endings, read_binary_sample, sha256_hex,
    LineEnding, TextFileToolError, MAX_READ_BYTES, MAX_WRITE_BYTES,
};
use super::workspace_path::{format_error_path, resolve_workspace_write_path, workspace_relative_path};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileModifyResult {
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

pub struct LoadedTextFile {
    pub text: String,
    pub encoding: &'static str,
    pub line_ending: LineEnding,
    pub original_bytes: Vec<u8>,
    pub file_mode: Option<u32>,
}

pub fn load_existing_text_file(
    workspace: &Path,
    raw_path: &str,
    respect_gitignore: bool,
) -> Result<(PathBuf, String, LoadedTextFile), TextFileToolError> {
    let canonical_workspace = workspace
        .canonicalize()
        .map_err(|error| TextFileToolError::new("invalid_workspace", error.to_string()))?;

    let target = resolve_workspace_write_path(workspace, raw_path)
        .map_err(|error| TextFileToolError::new("invalid_path", error))?;

    if !target.exists() {
        return Err(TextFileToolError::new(
            "path_not_found",
            format!(
                "Path not found: {}",
                format_error_path(&canonical_workspace, &target, raw_path)
            ),
        ));
    }
    if target.is_dir() {
        return Err(TextFileToolError::new(
            "is_directory",
            format!(
                "Path is a directory, not a file: {}",
                format_error_path(&canonical_workspace, &target, raw_path)
            ),
        ));
    }

    let metadata = fs::metadata(&target).map_err(|error| {
        TextFileToolError::new("io_error", format!("Failed to read file metadata: {error}"))
    })?;
    let file_size = metadata.len();

    if file_size > MAX_READ_BYTES {
        return Err(TextFileToolError {
            code: "file_too_large".to_string(),
            message: format!(
                "File exceeds the {MAX_READ_BYTES} byte read limit ({file_size} bytes)"
            ),
            mime_type: None,
            size: Some(file_size),
            old_string_hex: None,
            file_snippet_hex: None,
        });
    }

    if respect_gitignore && is_gitignored(&canonical_workspace, &target)? {
        return Err(TextFileToolError::new(
            "gitignored",
            "Path is ignored by .gitignore",
        ));
    }

    let sample = read_binary_sample(&target)?;
    if let Some(mime_type) = detect_binary(&sample) {
        return Err(TextFileToolError {
            code: "binary_file".to_string(),
            message: format!("Binary file detected ({mime_type})"),
            mime_type: Some(mime_type),
            size: Some(file_size),
            old_string_hex: None,
            file_snippet_hex: None,
        });
    }

    let bytes = fs::read(&target).map_err(|error| {
        TextFileToolError::new("io_error", format!("Failed to read file: {error}"))
    })?;
    let (text, encoding) = decode_text(&bytes).ok_or_else(|| {
        TextFileToolError::new(
            "unsupported_encoding",
            "Could not decode file with supported text encodings",
        )
    })?;

    let relative_path = workspace_relative_path(&canonical_workspace, &target);
    let loaded = LoadedTextFile {
        line_ending: super::text_file::detect_line_ending(&text),
        text,
        encoding,
        original_bytes: bytes,
        file_mode: file_mode(&metadata),
    };

    Ok((target, relative_path, loaded))
}

pub fn verify_expected_sha256(
    bytes: &[u8],
    expected_sha256: Option<&str>,
) -> Result<(), TextFileToolError> {
    let Some(expected) = expected_sha256
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(());
    };

    let actual = sha256_hex(bytes);
    if !actual.eq_ignore_ascii_case(expected) {
        return Err(TextFileToolError::new(
            "file_changed",
            "File changed since it was last read; re-read the file and retry",
        ));
    }

    Ok(())
}

pub fn prepare_text_with_line_ending(text: &str, ending: LineEnding) -> String {
    normalize_line_endings(text, ending)
}

pub fn commit_text_modification(
    workspace: &Path,
    target: &Path,
    relative_path: &str,
    loaded: &LoadedTextFile,
    new_text: &str,
    action: &str,
    create_backup: bool,
) -> Result<FileModifyResult, TextFileToolError> {
    let prepared = prepare_text_with_line_ending(new_text, loaded.line_ending);
    let encoded = encode_text(&prepared, loaded.encoding)?;

    if encoded.len() > MAX_WRITE_BYTES {
        return Err(TextFileToolError {
            code: "file_too_large".to_string(),
            message: format!(
                "Content exceeds the {MAX_WRITE_BYTES} byte write limit ({} bytes)",
                encoded.len()
            ),
            mime_type: None,
            size: Some(encoded.len() as u64),
            old_string_hex: None,
            file_snippet_hex: None,
        });
    }

    // When enabled, writes a pre-edit copy under workspace/.history/ (see create_backup).
    let backup_path = if create_backup {
        Some(text_file::create_backup(workspace, target, relative_path)?)
    } else {
        None
    };

    let warning = if is_sensitive_path(relative_path) {
        Some("SENSITIVE_FILE".to_string())
    } else {
        None
    };

    atomic_write_bytes(target, &encoded, loaded.file_mode)?;

    let (lines_added, lines_removed) = count_line_diff(&loaded.text, &prepared);
    let metadata = fs::metadata(target).map_err(|error| {
        TextFileToolError::new(
            "io_error",
            format!("Failed to read written file metadata: {error}"),
        )
    })?;

    Ok(FileModifyResult {
        path: relative_path.to_string(),
        action: action.to_string(),
        sha256: sha256_hex(&encoded),
        bytes_written: metadata.len(),
        lines_added,
        lines_removed,
        backup_path,
        warning,
    })
}

#[cfg(unix)]
fn file_mode(metadata: &fs::Metadata) -> Option<u32> {
    use std::os::unix::fs::PermissionsExt;
    Some(metadata.permissions().mode())
}

#[cfg(not(unix))]
fn file_mode(_metadata: &fs::Metadata) -> Option<u32> {
    None
}
