use std::fs;
use std::path::PathBuf;

use base64::Engine;
use serde::Serialize;

use super::text_file::{
    guess_image_mime_type, read_binary_sample, sha256_hex, TextFileToolError,
};
use super::workspace_path::{
    format_error_path, resolve_workspace_write_path_unbounded, workspace_relative_path,
};

/// Generous cap on how large a single image may be before it is refused. Images
/// are fed to vision-capable models as base64 data URLs, and an oversized
/// payload would bloat the context window. Larger images should be resized or
/// downsampled by the agent first.
const MAX_IMAGE_READ_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadImageResult {
    pub path: String,
    pub mime_type: String,
    pub size_bytes: u64,
    pub sha256: String,
    /// Present only for vision-capable models. Carries the base64 data URL so
    /// the serialization layer can emit it as multimodal `image_url` input.
    /// Omitted for text-only models, which leaves the result readable text.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_data_url: Option<String>,
    /// For text-only models: a short, truthful note rendered as plain text so
    /// the model understands why it is not given pixel data.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

pub type ReadImageToolError = TextFileToolError;

/// Reads an image file for the agent. When `emit_vision` is true (the active
/// model supports multimodal input), the result includes a base64 data URL that
/// is turned into `image_url` vision input at serialization time. When false
/// (text-only model), only metadata is returned — never raw pixel data — so the
/// model gets truthful, readable information instead of unusable bytes.
pub fn tool_read_image(
    workspace_dir: String,
    path: String,
    emit_vision: bool,
) -> Result<ReadImageResult, ReadImageToolError> {
    let workspace = PathBuf::from(workspace_dir.trim());
    if workspace.as_os_str().is_empty() {
        return Err(ReadImageToolError::new(
            "workspace_required",
            "workspaceDir is required",
        ));
    }

    let canonical_workspace = workspace
        .canonicalize()
        .map_err(|error| ReadImageToolError::new("invalid_workspace", error.to_string()))?;
    let target = resolve_workspace_write_path_unbounded(&workspace, &path)
        .map_err(|error| ReadImageToolError::new("invalid_path", error))?;

    if !target.exists() {
        return Err(ReadImageToolError::new(
            "path_not_found",
            format!(
                "Path not found: {}",
                format_error_path(&canonical_workspace, &target, &path)
            ),
        ));
    }
    if target.is_dir() {
        return Err(ReadImageToolError::new(
            "is_directory",
            format!(
                "Path is a directory, not a file: {}",
                format_error_path(&canonical_workspace, &target, &path)
            ),
        ));
    }

    let metadata = fs::metadata(&target).map_err(|error| {
        ReadImageToolError::new("io_error", format!("Failed to read file metadata: {error}"))
    })?;
    let file_size = metadata.len();

    if file_size > MAX_IMAGE_READ_BYTES {
        return Err(ReadImageToolError {
            code: "file_too_large".to_string(),
            message: format!(
                "Image exceeds the {MAX_IMAGE_READ_BYTES} byte read limit ({file_size} bytes); resize or downsample it before reading."
            ),
            mime_type: None,
            size: Some(file_size),
            file_snippet_hex: None,
        });
    }

    let sample = read_binary_sample(&target)?;
    let mime_type = guess_image_mime_type(&path, &sample).ok_or_else(|| {
        ReadImageToolError::new(
            "not_an_image",
            "The file is not a recognized image. Use read_file for text files instead.",
        )
    })?;

    let bytes = fs::read(&target).map_err(|error| {
        ReadImageToolError::new("io_error", format!("Failed to read image file: {error}"))
    })?;
    let relative_path = workspace_relative_path(&canonical_workspace, &target);
    let sha256 = sha256_hex(&bytes);

    let (image_data_url, note) = if emit_vision {
        let data_url = format!(
            "data:{mime_type};base64,{}",
            base64::engine::general_purpose::STANDARD.encode(&bytes)
        );
        (Some(data_url), None)
    } else {
        (
            None,
            Some(format!(
                "This image's pixel data is not provided because the active model does not support vision (multimodal) input. Details: {mime_type}, {file_size} bytes."
            )),
        )
    };

    Ok(ReadImageResult {
        path: relative_path,
        mime_type,
        size_bytes: file_size,
        sha256,
        image_data_url,
        note,
    })
}

#[cfg(test)]
mod tests {
    use super::{tool_read_image, MAX_IMAGE_READ_BYTES};
    use std::fs;
    use std::path::PathBuf;

    fn temp_workspace(name: &str) -> PathBuf {
        let temp = std::env::temp_dir().join(format!(
            "coder-read-image-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&temp).expect("create temp dir");
        temp
    }

    #[test]
    fn returns_metadata_without_vision_for_text_only_model() {
        let temp = temp_workspace("metadata");
        fs::write(temp.join("image.png"), b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR").expect("write image");

        let result = tool_read_image(
            temp.to_string_lossy().into_owned(),
            "image.png".to_string(),
            false,
        )
        .expect("read image");

        assert_eq!(result.mime_type, "image/png");
        assert_eq!(result.size_bytes, 16);
        assert!(result.image_data_url.is_none(), "no data url for text-only model");
        let note = result.note.expect("note present");
        assert!(note.contains("does not support vision"), "note: {note}");
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn emits_data_url_for_vision_capable_model() {
        let temp = temp_workspace("vision");
        fs::write(temp.join("image.png"), b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR").expect("write image");

        let result = tool_read_image(
            temp.to_string_lossy().into_owned(),
            "image.png".to_string(),
            true,
        )
        .expect("read image");

        assert_eq!(result.mime_type, "image/png");
        let url = result.image_data_url.expect("data url present");
        assert!(url.starts_with("data:image/png;base64,"), "url prefix: {url}");
        assert!(result.note.is_none());
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_non_image() {
        let temp = temp_workspace("non-image");
        fs::write(temp.join("note.txt"), "just text").expect("write");

        let error = tool_read_image(
            temp.to_string_lossy().into_owned(),
            "note.txt".to_string(),
            true,
        )
        .expect_err("not an image");

        assert_eq!(error.code, "not_an_image");
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_missing_path() {
        let temp = temp_workspace("missing");
        let error = tool_read_image(
            temp.to_string_lossy().into_owned(),
            "nope.png".to_string(),
            true,
        )
        .expect_err("missing file");

        assert_eq!(error.code, "path_not_found");
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_oversized_image() {
        // Synthesize a buffer larger than the cap with PNG magic so it passes
        // magic detection but trips the size guard.
        let big = std::env::temp_dir().join(format!(
            "coder-read-image-big-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&big).expect("create dir");
        let path = big.join("big.png");
        let mut bytes = vec![0u8; (MAX_IMAGE_READ_BYTES as usize) + 1];
        bytes[..8].copy_from_slice(b"\x89PNG\r\n\x1a\n");
        fs::write(&path, &bytes).expect("write big");

        let error = tool_read_image(big.to_string_lossy().into_owned(), "big.png".to_string(), true)
            .expect_err("too large");

        assert_eq!(error.code, "file_too_large");
        let _ = fs::remove_dir_all(big);
    }
}
