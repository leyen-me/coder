use axum::{extract::State, http::StatusCode, Json};
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;

use crate::AppState;
use crate::tools::CODER_DIR_NAME;

const SETTINGS_FILE: &str = "settings.json";

fn get_coder_data_dir() -> PathBuf {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(CODER_DIR_NAME)
}

fn settings_path() -> PathBuf {
    get_coder_data_dir().join(SETTINGS_FILE)
}

fn load_settings() -> Value {
    let path = settings_path();
    if path.exists() {
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|content| serde_json::from_str(&content).ok())
            .unwrap_or(json!({}))
    } else {
        json!({})
    }
}

fn save_settings(settings: &Value) -> Result<(), String> {
    let path = settings_path();
    let content = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// Read a setting value from settings.json.
pub fn get_setting(key: &str) -> Option<String> {
    let settings = load_settings();
    settings
        .get(key)
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

/// Set a setting key-value pair in settings.json.
/// This is public so it can be called from main.rs at startup.
pub fn set_setting(key: &str, value: &str) -> Result<(), String> {
    let mut settings = load_settings();
    settings[key] = json!(value);
    save_settings(&settings)
}

#[derive(Deserialize)]
pub struct SetSettingParams {
    pub key: String,
    pub value: String,
}

#[derive(Deserialize)]
pub struct DeleteSettingParams {
    pub key: String,
}

pub async fn handle_settings_get(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let settings = load_settings();
    Ok(Json(settings))
}

pub async fn handle_settings_set(
    State(_state): State<Arc<AppState>>,
    Json(params): Json<SetSettingParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let mut settings = load_settings();
    settings[&params.key] = json!(params.value);
    save_settings(&settings).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(json!({ "ok": true })))
}

pub async fn handle_settings_delete(
    State(_state): State<Arc<AppState>>,
    Json(params): Json<DeleteSettingParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let mut settings = load_settings();
    settings.as_object_mut().map(|obj| obj.remove(&params.key));
    save_settings(&settings).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(json!({ "ok": true })))
}
