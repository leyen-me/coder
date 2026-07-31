use std::collections::BTreeMap;
use std::fs;
use std::path::{Component, Path, PathBuf};

use base64::Engine;
use regex::Regex;
use serde::{Deserialize, Serialize};

use super::workspace_path::{format_absolute_path, workspace_coder_subdir};

const SKILL_FILE_NAME: &str = "SKILL.md";

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SkillSource {
    User,
    Workspace,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSummary {
    pub slug: String,
    pub name: String,
    pub description: String,
    pub source: SkillSource,
    pub path: String,
    pub directory_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRecord {
    #[serde(flatten)]
    pub summary: SkillSummary,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserSkillListResult {
    pub root_path: String,
    pub skills: Vec<SkillRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRoots {
    pub user: String,
    pub workspace: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillCatalogResult {
    pub roots: SkillRoots,
    pub skills: Vec<SkillSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveSkillReferencesResult {
    pub skills: Vec<SkillRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteSkillResult {
    pub deleted: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedSkillFile {
    pub path: String,
    pub data_base64: String,
}

#[derive(Debug, Deserialize)]
struct SkillFrontmatter {
    name: String,
    description: String,
}

#[derive(Debug, Clone)]
struct DiscoveredSkill {
    summary: SkillSummary,
    content: String,
}

pub fn list_available_skills(workspace_dir: Option<&str>) -> Result<SkillCatalogResult, String> {
    let roots = skill_roots(workspace_dir)?;
    let user_skills = scan_skill_root(&roots.user_path, SkillSource::User)?;
    let workspace_skills = roots
        .workspace_path
        .as_ref()
        .map(|path| scan_skill_root(path, SkillSource::Workspace))
        .transpose()?
        .unwrap_or_default();

    let mut merged = BTreeMap::new();
    for skill in user_skills {
        merged.insert(skill.summary.slug.clone(), skill.summary);
    }
    for skill in workspace_skills {
        // Workspace-local skills override user-global skills with the same slug.
        merged.insert(skill.summary.slug.clone(), skill.summary);
    }

    Ok(SkillCatalogResult {
        roots: SkillRoots {
            user: format_absolute_path(&roots.user_path),
            workspace: roots
                .workspace_path
                .as_ref()
                .map(|path| format_absolute_path(path)),
        },
        skills: merged.into_values().collect(),
    })
}

pub fn list_user_skills() -> Result<UserSkillListResult, String> {
    let root = user_skills_root()?;
    let mut skills = scan_skill_root(&root, SkillSource::User)?
        .into_iter()
        .map(|skill| SkillRecord {
            summary: skill.summary,
            content: skill.content,
        })
        .collect::<Vec<_>>();

    skills.sort_by(|left, right| left.summary.slug.cmp(&right.summary.slug));

    Ok(UserSkillListResult {
        root_path: format_absolute_path(&root),
        skills,
    })
}

pub fn resolve_skill_references(
    workspace_dir: Option<&str>,
    slugs: &[String],
) -> Result<ResolveSkillReferencesResult, String> {
    let mut resolved = Vec::new();
    for slug in unique_skill_slugs(slugs) {
        let skill = resolve_skill_reference(workspace_dir, &slug)?
            .ok_or_else(|| format!("Skill not found: {slug}"))?;
        resolved.push(SkillRecord {
            summary: skill.summary,
            content: skill.content,
        });
    }

    Ok(ResolveSkillReferencesResult { skills: resolved })
}

/// Soft resolve: skip missing/deleted slugs instead of failing the whole batch.
/// Used when replaying historical messages that may still reference removed skills.
pub fn resolve_available_skill_references(
    workspace_dir: Option<&str>,
    slugs: &[String],
) -> Result<ResolveSkillReferencesResult, String> {
    let mut resolved = Vec::new();
    for slug in unique_skill_slugs(slugs) {
        if let Some(skill) = resolve_skill_reference(workspace_dir, &slug)? {
            resolved.push(SkillRecord {
                summary: skill.summary,
                content: skill.content,
            });
        }
    }

    Ok(ResolveSkillReferencesResult { skills: resolved })
}

fn unique_skill_slugs(slugs: &[String]) -> Vec<String> {
    let mut unique = Vec::new();
    for slug in slugs {
        let trimmed = slug.trim();
        if !trimmed.is_empty() && !unique.iter().any(|existing: &String| existing == trimmed) {
            unique.push(trimmed.to_string());
        }
    }
    unique
}

pub fn ensure_skill_roots(workspace_dir: Option<&str>) -> Result<SkillRoots, String> {
    let roots = skill_roots(workspace_dir)?;
    Ok(SkillRoots {
        user: format_absolute_path(&roots.user_path),
        workspace: roots
            .workspace_path
            .as_ref()
            .map(|path| format_absolute_path(path)),
    })
}

pub fn import_user_skill(files: Vec<ImportedSkillFile>) -> Result<SkillRecord, String> {
    let root = user_skills_root()?;
    fs::create_dir_all(&root).map_err(|error| format!("Failed to prepare skills directory: {error}"))?;

    let normalized_files = normalize_imported_files(files)?;
    let skill_dir_name = single_skill_root_name(&normalized_files)?;
    let skill_dir = root.join(&skill_dir_name);
    if skill_dir.exists() {
        return Err(format!("A skill named \"{skill_dir_name}\" already exists."));
    }

    let skill_markdown = normalized_files
        .iter()
        .find(|file| file.relative_path == PathBuf::from(format!("{skill_dir_name}/{SKILL_FILE_NAME}")))
        .ok_or_else(|| format!("{SKILL_FILE_NAME} is required at the skill root."))?;

    let skill_content =
        String::from_utf8(skill_markdown.bytes.clone()).map_err(|_| format!("{SKILL_FILE_NAME} must be valid UTF-8."))?;
    let frontmatter = parse_skill_frontmatter(&skill_content)?;
    if frontmatter.name != skill_dir_name {
        return Err(format!(
            "Skill name \"{}\" must match the directory name \"{}\".",
            frontmatter.name, skill_dir_name
        ));
    }

    let temp_dir = root.join(format!(".tmp-import-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&temp_dir).map_err(|error| format!("Failed to create import directory: {error}"))?;

    let write_result = write_imported_skill_files(&temp_dir, &normalized_files);
    if let Err(error) = write_result {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(error);
    }

    let staged_root = temp_dir.join(&skill_dir_name);
    fs::rename(&staged_root, &skill_dir)
        .map_err(|error| format!("Failed to install skill: {error}"))?;
    let _ = fs::remove_dir_all(&temp_dir);

    let installed = read_skill_from_dir(&skill_dir, SkillSource::User)?
        .ok_or_else(|| "Installed skill could not be read back.".to_string())?;

    Ok(SkillRecord {
        summary: installed.summary,
        content: installed.content,
    })
}

pub fn delete_user_skill(slug: &str) -> Result<DeleteSkillResult, String> {
    if !is_valid_skill_slug(slug) {
        return Err("Invalid skill slug.".to_string());
    }

    let target = user_skills_root()?.join(slug);
    if !target.exists() {
        return Ok(DeleteSkillResult { deleted: false });
    }
    if !target.is_dir() {
        return Err("Skill path exists but is not a directory.".to_string());
    }

    fs::remove_dir_all(&target).map_err(|error| format!("Failed to delete skill: {error}"))?;
    Ok(DeleteSkillResult { deleted: true })
}

fn resolve_skill_reference(
    workspace_dir: Option<&str>,
    slug: &str,
) -> Result<Option<DiscoveredSkill>, String> {
    if !is_valid_skill_slug(slug) {
        return Ok(None);
    }

    let roots = skill_roots(workspace_dir)?;
    if let Some(workspace_root) = roots.workspace_path.as_ref() {
        let workspace_candidate = workspace_root.join(slug);
        if let Some(skill) = read_skill_from_dir(&workspace_candidate, SkillSource::Workspace)? {
            return Ok(Some(skill));
        }
    }

    let user_candidate = roots.user_path.join(slug);
    read_skill_from_dir(&user_candidate, SkillSource::User)
}

fn scan_skill_root(root: &Path, source: SkillSource) -> Result<Vec<DiscoveredSkill>, String> {
    if !root.exists() {
        return Ok(Vec::new());
    }
    if !root.is_dir() {
        return Err(format!(
            "Skills root is not a directory: {}",
            format_absolute_path(root)
        ));
    }

    let entries = fs::read_dir(root).map_err(|error| {
        format!(
            "Failed to read skills directory {}: {error}",
            format_absolute_path(root)
        )
    })?;

    let mut skills = Vec::new();
    for entry in entries {
        let entry = match entry {
            Ok(value) => value,
            Err(_) => continue,
        };
        let file_type = match entry.file_type() {
            Ok(value) => value,
            Err(_) => continue,
        };
        if !file_type.is_dir() {
            continue;
        }

        if let Some(skill) = read_skill_from_dir(&entry.path(), source)? {
            skills.push(skill);
        }
    }

    skills.sort_by(|left, right| left.summary.slug.cmp(&right.summary.slug));
    Ok(skills)
}

fn read_skill_from_dir(path: &Path, source: SkillSource) -> Result<Option<DiscoveredSkill>, String> {
    if !path.exists() || !path.is_dir() {
        return Ok(None);
    }

    let skill_file = path.join(SKILL_FILE_NAME);
    if !skill_file.is_file() {
        return Ok(None);
    }

    let content = fs::read_to_string(&skill_file).map_err(|error| {
        format!(
            "Failed to read skill file {}: {error}",
            format_absolute_path(&skill_file)
        )
    })?;

    let frontmatter = match parse_skill_frontmatter(&content) {
        Ok(value) => value,
        Err(_) => return Ok(None),
    };

    let directory_name = match path.file_name().and_then(|name| name.to_str()) {
        Some(value) => value,
        None => return Ok(None),
    };

    if frontmatter.name != directory_name || !is_valid_skill_slug(&frontmatter.name) {
        return Ok(None);
    }

    Ok(Some(DiscoveredSkill {
        summary: SkillSummary {
            slug: frontmatter.name.clone(),
            name: frontmatter.name,
            description: frontmatter.description.trim().to_string(),
            source,
            path: format_absolute_path(&skill_file),
            directory_path: format_absolute_path(path),
        },
        content,
    }))
}

fn parse_skill_frontmatter(content: &str) -> Result<SkillFrontmatter, String> {
    let normalized = content.replace("\r\n", "\n");
    let rest = normalized
        .strip_prefix("---\n")
        .ok_or_else(|| "SKILL.md must start with YAML frontmatter.".to_string())?;
    let end = rest
        .find("\n---\n")
        .or_else(|| rest.find("\n---"))
        .ok_or_else(|| "SKILL.md frontmatter is not terminated.".to_string())?;
    let yaml = &rest[..end];

    let frontmatter: SkillFrontmatter =
        serde_yaml::from_str(yaml).map_err(|error| format!("Invalid SKILL.md frontmatter: {error}"))?;

    if !is_valid_skill_slug(frontmatter.name.trim()) {
        return Err("Skill name must be lowercase kebab-case.".to_string());
    }
    if frontmatter.description.trim().is_empty() {
        return Err("Skill description is required.".to_string());
    }

    Ok(SkillFrontmatter {
        name: frontmatter.name.trim().to_string(),
        description: frontmatter.description.trim().to_string(),
    })
}

fn is_valid_skill_slug(slug: &str) -> bool {
    Regex::new(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
        .expect("valid skill slug regex")
        .is_match(slug)
}

fn user_skills_root() -> Result<PathBuf, String> {
    Ok(crate::user_coder_subdir("skills"))
}

fn workspace_skills_root(workspace_dir: &str) -> Option<PathBuf> {
    let trimmed = workspace_dir.trim();
    if trimmed.is_empty() {
        return None;
    }

    let workspace_path = PathBuf::from(trimmed);
    if workspace_path == PathBuf::from(".") || workspace_path == crate::get_coder_data_dir() {
        return None;
    }

    Some(workspace_coder_subdir(&workspace_path, "skills"))
}

struct ResolvedSkillRoots {
    user_path: PathBuf,
    workspace_path: Option<PathBuf>,
}

fn skill_roots(workspace_dir: Option<&str>) -> Result<ResolvedSkillRoots, String> {
    let user_path = user_skills_root()?;
    ensure_directory(&user_path)?;

    let workspace_path = workspace_dir.and_then(workspace_skills_root);

    Ok(ResolvedSkillRoots {
        user_path,
        workspace_path,
    })
}

fn ensure_directory(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|error| {
        format!(
            "Failed to prepare skills directory {}: {error}",
            format_absolute_path(path)
        )
    })
}

struct NormalizedImportedFile {
    relative_path: PathBuf,
    bytes: Vec<u8>,
}

fn normalize_imported_files(files: Vec<ImportedSkillFile>) -> Result<Vec<NormalizedImportedFile>, String> {
    let mut normalized = Vec::new();
    for file in files {
        let path = normalize_import_path(&file.path)?;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(file.data_base64.as_bytes())
            .map_err(|error| format!("Invalid base64 file payload for {}: {error}", file.path))?;
        normalized.push(NormalizedImportedFile {
            relative_path: path,
            bytes,
        });
    }

    if normalized.is_empty() {
        return Err("The zip file did not contain any files.".to_string());
    }

    Ok(normalized)
}

fn normalize_import_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim().replace('\\', "/");
    if trimmed.is_empty() {
        return Err("Imported files must have a path.".to_string());
    }
    if trimmed.starts_with('/') {
        return Err(format!("Imported path must be relative: {trimmed}"));
    }

    let candidate = PathBuf::from(trimmed);
    for component in candidate.components() {
        match component {
            Component::Normal(_) => {}
            _ => return Err("Imported zip contains an invalid path.".to_string()),
        }
    }

    Ok(candidate)
}

fn single_skill_root_name(files: &[NormalizedImportedFile]) -> Result<String, String> {
    let mut root_names = files
        .iter()
        .filter_map(|file| {
            file.relative_path
                .components()
                .next()
                .and_then(|component| match component {
                    Component::Normal(name) => name.to_str().map(|value| value.to_string()),
                    _ => None,
                })
        })
        .collect::<Vec<_>>();

    root_names.sort();
    root_names.dedup();

    if root_names.len() != 1 {
        return Err("The imported zip must contain exactly one top-level skill directory.".to_string());
    }

    let root_name = root_names.remove(0);
    if !is_valid_skill_slug(&root_name) {
        return Err("The skill directory name must be lowercase kebab-case.".to_string());
    }

    Ok(root_name)
}

fn write_imported_skill_files(root: &Path, files: &[NormalizedImportedFile]) -> Result<(), String> {
    for file in files {
        let target = root.join(&file.relative_path);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("Failed to create skill directory: {error}"))?;
        }
        fs::write(&target, &file.bytes).map_err(|error| {
            format!(
                "Failed to write imported file {}: {error}",
                format_absolute_path(&target)
            )
        })?;
    }

    Ok(())
}
