use axum::{extract::State, http::StatusCode, Json};
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;

use crate::tools::{
    delete_user_skill, export_skill, import_user_skill, list_available_skills, list_user_skills,
    resolve_skill_references, ImportedSkillFile,
};
use crate::AppState;

fn resolve_workspace_dir(requested: Option<String>, fallback: &std::path::Path) -> Option<String> {
    requested
        .and_then(|dir| {
            let trimmed = dir.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        })
        .or_else(|| {
            let fallback = fallback.to_string_lossy().trim().to_string();
            if fallback.is_empty() {
                None
            } else {
                Some(fallback)
            }
        })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsCatalogParams {
    pub workspace_dir: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveSkillReferencesParams {
    pub workspace_dir: Option<String>,
    pub slugs: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSkillParams {
    pub files: Vec<ImportedSkillFile>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteSkillParams {
    pub slug: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSkillParams {
    pub slug: String,
    pub workspace_dir: Option<String>,
}

/// POST /api/skills/catalog
pub async fn handle_skills_catalog(
    State(state): State<Arc<AppState>>,
    Json(params): Json<SkillsCatalogParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let workspace_dir = resolve_workspace_dir(params.workspace_dir, &state.workspace_dir);
    let result = list_available_skills(workspace_dir.as_deref())
        .map_err(|error| (StatusCode::BAD_REQUEST, error))?;
    Ok(Json(serde_json::to_value(result).map_err(|error| {
        (StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
    })?))
}

/// POST /api/skills/user_list
pub async fn handle_user_skills(
    State(_state): State<Arc<AppState>>,
    Json(_params): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let result = list_user_skills().map_err(|error| (StatusCode::BAD_REQUEST, error))?;
    Ok(Json(serde_json::to_value(result).map_err(|error| {
        (StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
    })?))
}

/// POST /api/skills/resolve_references
pub async fn handle_resolve_skill_references(
    State(state): State<Arc<AppState>>,
    Json(params): Json<ResolveSkillReferencesParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let workspace_dir = resolve_workspace_dir(params.workspace_dir, &state.workspace_dir);
    let result = resolve_skill_references(workspace_dir.as_deref(), &params.slugs)
        .map_err(|error| (StatusCode::BAD_REQUEST, error))?;
    Ok(Json(serde_json::to_value(result).map_err(|error| {
        (StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
    })?))
}

/// POST /api/skills/import
pub async fn handle_import_skill(
    State(_state): State<Arc<AppState>>,
    Json(params): Json<ImportSkillParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let result = import_user_skill(params.files)
        .map_err(|error| (StatusCode::BAD_REQUEST, error))?;
    Ok(Json(serde_json::json!({ "skill": result })))
}

/// POST /api/skills/delete
pub async fn handle_delete_skill(
    State(_state): State<Arc<AppState>>,
    Json(params): Json<DeleteSkillParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let result =
        delete_user_skill(params.slug.trim()).map_err(|error| (StatusCode::BAD_REQUEST, error))?;
    Ok(Json(serde_json::to_value(result).map_err(|error| {
        (StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
    })?))
}

/// POST /api/skills/export
pub async fn handle_export_skill(
    State(state): State<Arc<AppState>>,
    Json(params): Json<ExportSkillParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let workspace_dir = resolve_workspace_dir(params.workspace_dir, &state.workspace_dir);
    let result = export_skill(workspace_dir.as_deref(), params.slug.trim())
        .map_err(|error| (StatusCode::BAD_REQUEST, error))?;
    Ok(Json(serde_json::to_value(result).map_err(|error| {
        (StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
    })?))
}
