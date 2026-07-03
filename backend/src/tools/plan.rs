use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde::Serialize;

use super::text_file::{
    apply_text_replacement, atomic_write_bytes, count_lines, decode_text, encode_text, sha256_hex,
    TextFileToolError, MAX_WRITE_BYTES,
};
use super::workspace_path::{resolve_workspace_path, resolve_workspace_write_path, workspace_relative_path};

const PLAN_DIR: &str = ".plan";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanFileResult {
    pub path: String,
    pub name: String,
    pub sha256: String,
    pub bytes_written: u64,
    pub lines: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanReadResult {
    pub path: String,
    pub name: String,
    pub content: String,
    pub sha256: String,
    pub modified_at: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanListEntry {
    pub name: String,
    pub path: String,
    pub modified_at: u64,
    pub bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanListResult {
    pub plans: Vec<PlanListEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanDeleteResult {
    pub path: String,
    pub name: String,
}

fn validate_plan_name(name: &str) -> Result<&str, TextFileToolError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(TextFileToolError::new(
            "invalid_name",
            "Plan name is required",
        ));
    }

    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err(TextFileToolError::new(
            "invalid_name",
            "Plan name must be a filename only, not a path",
        ));
    }

    if !trimmed.ends_with("-plan.md") {
        return Err(TextFileToolError::new(
            "invalid_name",
            "Plan filename must end with -plan.md (e.g. refactor-auth-plan.md)",
        ));
    }

    let slug = trimmed.strip_suffix("-plan.md").unwrap_or(trimmed);
    if slug.is_empty() {
        return Err(TextFileToolError::new(
            "invalid_name",
            "Plan filename must include a descriptive slug before -plan.md",
        ));
    }

    if !slug
        .chars()
        .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-')
    {
        return Err(TextFileToolError::new(
            "invalid_name",
            "Plan slug must use lowercase letters, numbers, and hyphens only",
        ));
    }

    if slug.starts_with('-') || slug.ends_with('-') || slug.contains("--") {
        return Err(TextFileToolError::new(
            "invalid_name",
            "Plan slug must not start/end with hyphens or contain consecutive hyphens",
        ));
    }

    Ok(trimmed)
}

fn plan_relative_path(name: &str) -> String {
    format!("{PLAN_DIR}/{name}")
}

fn resolve_existing_plan(
    workspace: &Path,
    name: &str,
) -> Result<(PathBuf, String, String), TextFileToolError> {
    let validated = validate_plan_name(name)?;
    let relative = plan_relative_path(validated);
    let target = resolve_workspace_path(workspace, &relative)
        .map_err(|error| TextFileToolError::new("invalid_path", error))?;

    if !target.exists() {
        return Err(TextFileToolError::new(
            "plan_not_found",
            format!("Plan not found: {relative}"),
        ));
    }

    if target.is_dir() {
        return Err(TextFileToolError::new(
            "invalid_path",
            format!("Path is a directory, not a plan file: {relative}"),
        ));
    }

    Ok((target, relative, validated.to_string()))
}

fn resolve_new_plan(
    workspace: &Path,
    name: &str,
) -> Result<(PathBuf, String, String), TextFileToolError> {
    let validated = validate_plan_name(name)?;
    let relative = plan_relative_path(validated);
    let target = resolve_workspace_write_path(workspace, &relative)
        .map_err(|error| TextFileToolError::new("invalid_path", error))?;
    Ok((target, relative, validated.to_string()))
}

fn ensure_plan_dir(workspace: &Path) -> Result<PathBuf, TextFileToolError> {
    let plan_dir = workspace.join(PLAN_DIR);
    fs::create_dir_all(&plan_dir).map_err(|error| {
        TextFileToolError::new(
            "io_error",
            format!("Failed to create .plan directory: {error}"),
        )
    })?;
    Ok(plan_dir)
}

fn write_plan_content(
    workspace: &Path,
    target: &Path,
    relative_path: &str,
    name: &str,
    content: &str,
) -> Result<PlanFileResult, TextFileToolError> {
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

    ensure_plan_dir(workspace)?;
    let encoded = encode_text(content, "utf-8")?;
    atomic_write_bytes(target, &encoded, None)?;

    let metadata = fs::metadata(target).map_err(|error| {
        TextFileToolError::new(
            "io_error",
            format!("Failed to read written plan metadata: {error}"),
        )
    })?;

    Ok(PlanFileResult {
        path: relative_path.to_string(),
        name: name.to_string(),
        sha256: sha256_hex(&encoded),
        bytes_written: metadata.len(),
        lines: count_lines(content),
    })
}

fn modified_at_ms(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

pub fn tool_plan_create(
    workspace_dir: String,
    name: String,
    content: String,
) -> Result<PlanFileResult, TextFileToolError> {
    let workspace = PathBuf::from(workspace_dir.trim());
    if workspace.as_os_str().is_empty() {
        return Err(TextFileToolError::new(
            "workspace_required",
            "workspaceDir is required",
        ));
    }

    let (target, relative_path, validated_name) = resolve_new_plan(&workspace, &name)?;
    if target.exists() {
        return Err(TextFileToolError::new(
            "plan_already_exists",
            format!("Plan already exists: {relative_path}. Use plan_update to modify it."),
        ));
    }

    write_plan_content(
        &workspace,
        &target,
        &relative_path,
        &validated_name,
        &content,
    )
}

pub fn tool_plan_read(
    workspace_dir: String,
    name: String,
) -> Result<PlanReadResult, TextFileToolError> {
    let workspace = PathBuf::from(workspace_dir.trim());
    if workspace.as_os_str().is_empty() {
        return Err(TextFileToolError::new(
            "workspace_required",
            "workspaceDir is required",
        ));
    }

    let (target, relative_path, validated_name) = resolve_existing_plan(&workspace, &name)?;
    let bytes = fs::read(&target).map_err(|error| {
        TextFileToolError::new("io_error", format!("Failed to read plan file: {error}"))
    })?;
    let (content, _encoding) = decode_text(&bytes).ok_or_else(|| {
        TextFileToolError::new(
            "unsupported_encoding",
            "Could not decode plan file with supported text encodings",
        )
    })?;

    Ok(PlanReadResult {
        path: relative_path,
        name: validated_name,
        content,
        sha256: sha256_hex(&bytes),
        modified_at: modified_at_ms(&target),
    })
}

pub fn tool_plan_update(
    workspace_dir: String,
    name: String,
    content: String,
) -> Result<PlanFileResult, TextFileToolError> {
    let workspace = PathBuf::from(workspace_dir.trim());
    if workspace.as_os_str().is_empty() {
        return Err(TextFileToolError::new(
            "workspace_required",
            "workspaceDir is required",
        ));
    }

    let (target, relative_path, validated_name) = resolve_existing_plan(&workspace, &name)?;
    write_plan_content(
        &workspace,
        &target,
        &relative_path,
        &validated_name,
        &content,
    )
}

/// Apply a targeted search-and-replace edit to an existing plan file.
/// Prefer this over plan_update for small changes.
pub fn tool_plan_edit(
    workspace_dir: String,
    name: String,
    old_string: String,
    new_string: String,
    replace_all: Option<bool>,
) -> Result<PlanFileResult, TextFileToolError> {
    let workspace = PathBuf::from(workspace_dir.trim());
    if workspace.as_os_str().is_empty() {
        return Err(TextFileToolError::new(
            "workspace_required",
            "workspaceDir is required",
        ));
    }

    let (target, relative_path, validated_name) = resolve_existing_plan(&workspace, &name)?;
    let bytes = fs::read(&target).map_err(|error| {
        TextFileToolError::new("io_error", format!("Failed to read plan file: {error}"))
    })?;
    let (content, _encoding) = decode_text(&bytes).ok_or_else(|| {
        TextFileToolError::new(
            "unsupported_encoding",
            "Could not decode plan file with supported text encodings",
        )
    })?;

    let replace_all = replace_all.unwrap_or(false);
    let updated = apply_text_replacement(&content, &old_string, &new_string, replace_all)?;

    write_plan_content(
        &workspace,
        &target,
        &relative_path,
        &validated_name,
        &updated,
    )
}

pub fn tool_plan_delete(
    workspace_dir: String,
    name: String,
) -> Result<PlanDeleteResult, TextFileToolError> {
    let workspace = PathBuf::from(workspace_dir.trim());
    if workspace.as_os_str().is_empty() {
        return Err(TextFileToolError::new(
            "workspace_required",
            "workspaceDir is required",
        ));
    }

    let (target, relative_path, validated_name) = resolve_existing_plan(&workspace, &name)?;
    fs::remove_file(&target).map_err(|error| {
        TextFileToolError::new("io_error", format!("Failed to delete plan file: {error}"))
    })?;

    Ok(PlanDeleteResult {
        path: relative_path,
        name: validated_name,
    })
}

pub fn tool_plan_list(workspace_dir: String) -> Result<PlanListResult, TextFileToolError> {
    let workspace = PathBuf::from(workspace_dir.trim());
    if workspace.as_os_str().is_empty() {
        return Err(TextFileToolError::new(
            "workspace_required",
            "workspaceDir is required",
        ));
    }

    let canonical_workspace = workspace
        .canonicalize()
        .map_err(|error| TextFileToolError::new("invalid_workspace", error.to_string()))?;
    let plan_dir = canonical_workspace.join(PLAN_DIR);

    if !plan_dir.exists() {
        return Ok(PlanListResult { plans: Vec::new() });
    }

    let mut plans = Vec::new();
    let entries = fs::read_dir(&plan_dir).map_err(|error| {
        TextFileToolError::new("io_error", format!("Failed to read .plan directory: {error}"))
    })?;

    for entry in entries {
        let entry = entry.map_err(|error| {
            TextFileToolError::new("io_error", format!("Failed to read plan entry: {error}"))
        })?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let file_name = entry.file_name();
        let name = file_name.to_string_lossy();
        if validate_plan_name(&name).is_err() {
            continue;
        }

        let metadata = entry.metadata().map_err(|error| {
            TextFileToolError::new("io_error", format!("Failed to read plan metadata: {error}"))
        })?;
        let relative = workspace_relative_path(&canonical_workspace, &path);

        plans.push(PlanListEntry {
            name: name.to_string(),
            path: relative,
            modified_at: modified_at_ms(&path),
            bytes: metadata.len(),
        });
    }

    plans.sort_by(|left, right| right.modified_at.cmp(&left.modified_at));

    Ok(PlanListResult { plans })
}

#[cfg(test)]
mod tests {
    use super::{
        tool_plan_create, tool_plan_delete, tool_plan_list, tool_plan_read, tool_plan_update,
    };
    use std::fs;
    use std::path::PathBuf;

    fn temp_workspace(name: &str) -> PathBuf {
        let temp = std::env::temp_dir().join(format!(
            "coder-plan-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&temp).expect("create temp dir");
        temp
    }

    #[test]
    fn creates_reads_updates_lists_and_deletes_plan() {
        let temp = temp_workspace("lifecycle");
        let created = tool_plan_create(
            temp.to_string_lossy().into_owned(),
            "refactor-auth-plan.md".to_string(),
            "# Refactor Auth\n\nStep 1\n".to_string(),
        )
        .expect("create plan");

        assert_eq!(created.path, ".plan/refactor-auth-plan.md");
        assert_eq!(created.name, "refactor-auth-plan.md");

        let read = tool_plan_read(
            temp.to_string_lossy().into_owned(),
            "refactor-auth-plan.md".to_string(),
        )
        .expect("read plan");
        assert!(read.content.contains("Refactor Auth"));

        let updated = tool_plan_update(
            temp.to_string_lossy().into_owned(),
            "refactor-auth-plan.md".to_string(),
            "# Refactor Auth\n\nStep 1\nStep 2\n".to_string(),
        )
        .expect("update plan");
        assert_eq!(updated.lines, 4);

        let listed = tool_plan_list(temp.to_string_lossy().into_owned()).expect("list plans");
        assert_eq!(listed.plans.len(), 1);
        assert_eq!(listed.plans[0].name, "refactor-auth-plan.md");

        let deleted = tool_plan_delete(
            temp.to_string_lossy().into_owned(),
            "refactor-auth-plan.md".to_string(),
        )
        .expect("delete plan");
        assert_eq!(deleted.name, "refactor-auth-plan.md");

        let listed_after = tool_plan_list(temp.to_string_lossy().into_owned()).expect("list empty");
        assert!(listed_after.plans.is_empty());

        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_invalid_plan_names() {
        let temp = temp_workspace("invalid-name");
        let error = tool_plan_create(
            temp.to_string_lossy().into_owned(),
            "Bad Name.md".to_string(),
            "content".to_string(),
        )
        .expect_err("invalid name");
        assert_eq!(error.code, "invalid_name");
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_duplicate_create() {
        let temp = temp_workspace("duplicate");
        tool_plan_create(
            temp.to_string_lossy().into_owned(),
            "migration-plan.md".to_string(),
            "plan".to_string(),
        )
        .expect("first create");

        let error = tool_plan_create(
            temp.to_string_lossy().into_owned(),
            "migration-plan.md".to_string(),
            "plan 2".to_string(),
        )
        .expect_err("duplicate");
        assert_eq!(error.code, "plan_already_exists");
        let _ = fs::remove_dir_all(temp);
    }
}
