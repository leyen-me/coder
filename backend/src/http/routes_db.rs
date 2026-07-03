use axum::{extract::State, http::StatusCode, Json};
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;

use crate::db::IndexEntry;
use crate::AppState;

#[derive(Deserialize)]
pub struct DbGetParams {
    pub store: String,
    pub id: String,
}

#[derive(Deserialize)]
pub struct DbPutParams {
    pub store: String,
    pub id: String,
    pub value: Value,
    pub indexes: Option<Vec<IndexEntryParam>>,
}

#[derive(Deserialize)]
pub struct IndexEntryParam {
    pub name: String,
    pub value: String,
}

#[derive(Deserialize)]
pub struct DbDeleteParams {
    pub store: String,
    pub id: String,
}

#[derive(Deserialize)]
pub struct DbGetAllParams {
    pub store: String,
}

#[derive(Deserialize)]
pub struct DbGetAllFromIndexParams {
    pub store: String,
    pub index_name: String,
    pub index_value: Option<String>,
}

#[derive(Deserialize)]
pub struct DbCountParams {
    pub store: String,
}

#[derive(Deserialize)]
pub struct DbClearParams {
    pub store: String,
}

#[derive(serde::Serialize)]
pub struct DbCountResponse {
    pub count: i64,
}

pub async fn handle_db_get(
    State(state): State<Arc<AppState>>,
    Json(params): Json<DbGetParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = state.db.lock().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let value = db
        .get::<Value>(&params.store, &params.id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(value.unwrap_or(Value::Null)))
}

pub async fn handle_db_put(
    State(state): State<Arc<AppState>>,
    Json(params): Json<DbPutParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = state.db.lock().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let indexes: Vec<IndexEntry> = params
        .indexes
        .unwrap_or_default()
        .into_iter()
        .map(|i| IndexEntry {
            name: i.name,
            value: i.value,
        })
        .collect();
    db.put(&params.store, &params.id, &params.value, &indexes)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn handle_db_delete(
    State(state): State<Arc<AppState>>,
    Json(params): Json<DbDeleteParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = state.db.lock().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    db.delete(&params.store, &params.id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn handle_db_get_all(
    State(state): State<Arc<AppState>>,
    Json(params): Json<DbGetAllParams>,
) -> Result<Json<Vec<Value>>, (StatusCode, String)> {
    let db = state.db.lock().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let values = db
        .get_all::<Value>(&params.store)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(values))
}

pub async fn handle_db_get_all_from_index(
    State(state): State<Arc<AppState>>,
    Json(params): Json<DbGetAllFromIndexParams>,
) -> Result<Json<Vec<Value>>, (StatusCode, String)> {
    let db = state.db.lock().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let values = db
        .get_all_from_index::<Value>(&params.store, &params.index_name, params.index_value.as_deref())
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(values))
}

pub async fn handle_db_count(
    State(state): State<Arc<AppState>>,
    Json(params): Json<DbCountParams>,
) -> Result<Json<DbCountResponse>, (StatusCode, String)> {
    let db = state.db.lock().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let count = db
        .count(&params.store)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(DbCountResponse { count }))
}

pub async fn handle_db_clear(
    State(state): State<Arc<AppState>>,
    Json(params): Json<DbClearParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = state.db.lock().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    db.clear(&params.store)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(serde_json::json!({ "ok": true })))
}
