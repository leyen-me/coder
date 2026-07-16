use axum::{extract::State, http::StatusCode, Json};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::agent;
use crate::scheduled_jobs::{
    create_job, delete_job, get_job, list_jobs, run_job_by_id, update_job, CreateJobInput,
    ScheduledJobRecord, UpdateJobInput,
};
use crate::tools::shell_kill_by_task;
use crate::AppState;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobIdParams {
    pub id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToggleJobParams {
    pub id: String,
    pub enabled: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateJobParams {
    pub id: String,
    #[serde(flatten)]
    pub patch: UpdateJobInput,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelScheduledJobParams {
    pub task_id: Option<String>,
    pub session_id: Option<String>,
    pub job_id: Option<String>,
}

pub async fn handle_list_jobs(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let jobs = list_jobs(&state.db).map_err(internal_error)?;
    Ok(Json(json!({ "items": jobs })))
}

pub async fn handle_create_job(
    State(state): State<Arc<AppState>>,
    Json(input): Json<CreateJobInput>,
) -> Result<Json<ScheduledJobRecord>, (StatusCode, String)> {
    validate_create_input(&input)?;
    create_job(&state.db, input).map(Json).map_err(bad_request)
}

pub async fn handle_update_job(
    State(state): State<Arc<AppState>>,
    Json(params): Json<UpdateJobParams>,
) -> Result<Json<ScheduledJobRecord>, (StatusCode, String)> {
    let record = update_job(&state.db, &params.id, params.patch)
        .map_err(bad_request)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Scheduled job not found".to_string()))?;
    Ok(Json(record))
}

pub async fn handle_delete_job(
    State(state): State<Arc<AppState>>,
    Json(params): Json<JobIdParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let deleted = delete_job(&state.db, &params.id).map_err(internal_error)?;
    if !deleted {
        return Err((StatusCode::NOT_FOUND, "Scheduled job not found".to_string()));
    }
    Ok(Json(json!({ "ok": true })))
}

pub async fn handle_toggle_job(
    State(state): State<Arc<AppState>>,
    Json(params): Json<ToggleJobParams>,
) -> Result<Json<ScheduledJobRecord>, (StatusCode, String)> {
    let record = update_job(
        &state.db,
        &params.id,
        UpdateJobInput {
            enabled: Some(params.enabled),
            ..UpdateJobInput::default()
        },
    )
    .map_err(bad_request)?
    .ok_or_else(|| (StatusCode::NOT_FOUND, "Scheduled job not found".to_string()))?;
    Ok(Json(record))
}

pub async fn handle_run_job(
    State(state): State<Arc<AppState>>,
    Json(params): Json<JobIdParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    if get_job(&state.db, &params.id)
        .map_err(internal_error)?
        .is_none()
    {
        return Err((StatusCode::NOT_FOUND, "Scheduled job not found".to_string()));
    }

    let started = run_job_by_id(state, &params.id).await.map_err(bad_request)?;
    Ok(Json(json!({
        "status": if started { "started" } else { "already_running" }
    })))
}

pub async fn handle_running_jobs(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    Ok(Json(json!({
        "ids": state.scheduled_job_lock.running_ids()
    })))
}

pub async fn handle_active_runs(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    Ok(Json(json!({
        "items": state.scheduled_job_active_runs.list()
    })))
}

pub async fn handle_cancel_scheduled_job(
    State(state): State<Arc<AppState>>,
    Json(params): Json<CancelScheduledJobParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let run = if let Some(job_id) = params
        .job_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        state.scheduled_job_active_runs.get_by_job_id(job_id)
    } else if let Some(identifier) = params
        .task_id
        .or(params.session_id)
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        state.scheduled_job_active_runs.find_by_task_or_session(identifier)
    } else {
        return Err((
            StatusCode::BAD_REQUEST,
            "taskId, sessionId, or jobId is required".to_string(),
        ));
    };

    let Some(run) = run else {
        return Ok(Json(json!({ "ok": true, "cancelled": false })));
    };

    let _ = state.ask_question_registry.cancel(&run.task_id, "Cancelled");
    let _ = agent::agent_cancel(&state.agent_registry, run.task_id.clone());
    let _ = shell_kill_by_task(&state.shell_registry, run.task_id.clone());

    Ok(Json(json!({
        "ok": true,
        "cancelled": true,
        "taskId": run.task_id,
        "sessionId": run.session_id,
    })))
}

fn validate_create_input(input: &CreateJobInput) -> Result<(), (StatusCode, String)> {
    if input.name.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Name is required".to_string()));
    }
    if input.cron_expression.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Cron expression is required".to_string(),
        ));
    }
    if input.prompt.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Prompt is required".to_string()));
    }
    if input.model.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Model is required".to_string()));
    }
    Ok(())
}

fn bad_request(error: String) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, error)
}

fn internal_error(error: String) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, error)
}
