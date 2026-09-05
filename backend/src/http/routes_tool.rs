use axum::{extract::{Path, State}, http::StatusCode, Json};
use axum::response::sse::{Event, KeepAlive, Sse};
use chrono::Utc;
use futures::stream::Stream;
use serde::Deserialize;
use serde_json::json;
use serde_json::Value;
use std::convert::Infallible;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::time::Duration;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::agent;
use crate::db::{
    records::{current_timestamp_ms, normalize_provider, MessageRecord},
    session_store::{
        delete_messages_after, get_messages_by_session, get_session, new_message_id,
        put_message, update_message, update_session,
    },
};
use crate::tools::*;
use crate::AppState;

const LOG_MESSAGE_PREVIEW_CHARS: usize = 160;

fn resolve_workspace_dir(requested: Option<String>, fallback: &std::path::Path) -> String {
    requested
        .and_then(|dir| {
            let trimmed = dir.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        })
        .map(|path| format_absolute_path(std::path::Path::new(&path)))
        .unwrap_or_else(|| format_absolute_path(fallback))
}

fn summarize_latest_user_message(messages: &[agent::ChatMessage]) -> Option<(usize, usize, String)> {
    let user_message_count = messages.iter().filter(|message| message.role == "user").count();
    let message = messages.iter().rev().find(|message| message.role == "user")?;
    let preview = summarize_message_content(message.content.as_ref());
    let char_count = preview.chars().count();
    Some((user_message_count, char_count, preview))
}

fn summarize_message_content(content: Option<&Value>) -> String {
    match content {
        Some(Value::String(text)) => truncate_for_log(text),
        Some(Value::Array(items)) => format!("[non-text content items={}]", items.len()),
        Some(Value::Object(_)) => "[structured content object]".to_string(),
        Some(Value::Bool(value)) => value.to_string(),
        Some(Value::Number(value)) => value.to_string(),
        Some(Value::Null) | None => "[empty]".to_string(),
    }
}

fn truncate_for_log(text: &str) -> String {
    let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut preview = String::new();
    for (index, ch) in normalized.chars().enumerate() {
        if index >= LOG_MESSAGE_PREVIEW_CHARS {
            preview.push_str("...");
            break;
        }
        preview.push(ch);
    }
    if preview.is_empty() {
        "[empty]".to_string()
    } else {
        preview
    }
}

fn derive_session_title(text: &str, max_length: usize) -> String {
    let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.chars().count() <= max_length {
        return normalized;
    }
    format!(
        "{}…",
        normalized
            .chars()
            .take(max_length.saturating_sub(1))
            .collect::<String>()
    )
}

fn session_fallback_workspace_dir(state: &AppState) -> Option<String> {
    let value = state.workspace_dir.to_string_lossy().trim().to_string();
    (!value.is_empty()).then_some(value)
}

fn normalize_skill_references(skills: Option<Vec<String>>) -> Option<Vec<String>> {
    let mut normalized = Vec::new();
    for value in skills.unwrap_or_default() {
        let trimmed = value.trim();
        if !trimmed.is_empty() && !normalized.iter().any(|existing: &String| existing == trimmed) {
            normalized.push(trimmed.to_string());
        }
    }
    (!normalized.is_empty()).then_some(normalized)
}

async fn cancel_active_session_task(state: &Arc<AppState>, session_id: &str) {
    let Ok(status) = agent::agent_get_session_status(&state.agent_registry, session_id.to_string()) else {
        return;
    };
    let Some(status) = status else {
        return;
    };
    let _ = state.ask_question_registry.cancel(&status.task_id, "Cancelled");
    let _ = agent::agent_cancel(&state.agent_registry, status.task_id.clone());
    let _ = shell_kill_by_task(&state.shell_registry, status.task_id);
}

// ---------------------------------------------------------------------------
// Params (one struct per POST route)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListDirParams {
    pub workspace_dir: Option<String>,
    pub path: String,
    pub recursive: Option<bool>,
    pub max_depth: Option<u32>,
    pub show_hidden: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileParams {
    pub workspace_dir: Option<String>,
    pub path: String,
    pub start_line: Option<u32>,
    pub max_lines: Option<u32>,
    pub numbered: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFileParams {
    pub workspace_dir: Option<String>,
    pub path: String,
    pub content: String,
    pub create_parent_dirs: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditFileParams {
    pub workspace_dir: Option<String>,
    pub path: String,
    pub old_string: String,
    pub new_string: String,
    pub expected_sha256: Option<String>,
    pub replace_all: Option<bool>,
    pub create_backup: Option<bool>,
    pub respect_gitignore: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceLinesParams {
    pub workspace_dir: Option<String>,
    pub path: String,
    pub start_line: u32,
    pub end_line: u32,
    pub content: String,
    pub expected_sha256: Option<String>,
    pub create_backup: Option<bool>,
    pub respect_gitignore: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceFileParams {
    pub workspace_dir: Option<String>,
    pub path: String,
    pub content: String,
    pub expected_sha256: Option<String>,
    pub create_backup: Option<bool>,
    pub respect_gitignore: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSnapshotParams {
    pub workspace_dir: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobParams {
    pub workspace_dir: Option<String>,
    pub glob_pattern: String,
    pub target_directory: Option<String>,
    pub head_limit: Option<u32>,
    pub respect_gitignore: Option<bool>,
    pub show_hidden: Option<bool>,
    pub offset: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrepParams {
    pub workspace_dir: Option<String>,
    pub pattern: String,
    pub path: Option<String>,
    pub glob: Option<String>,
    pub output_mode: Option<String>,
    pub case_insensitive: Option<bool>,
    pub context_before: Option<u32>,
    pub context_after: Option<u32>,
    pub context: Option<u32>,
    pub head_limit: Option<u32>,
    pub offset: Option<u32>,
    pub multiline: Option<bool>,
    pub respect_gitignore: Option<bool>,
    pub show_hidden: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellParams {
    pub workspace_dir: Option<String>,
    pub command: String,
    pub description: Option<String>,
    pub working_directory: Option<String>,
    pub block_until_ms: Option<u64>,
    pub task_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteShellParams {
    pub command: String,
    pub description: Option<String>,
    pub config: crate::tools::remote_connection::RemoteTargetConfig,
    pub block_until_ms: Option<u64>,
    pub task_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AwaitShellParams {
    pub shell_id: String,
    pub block_until_ms: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListShellsParams {
    pub status_filter: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KillShellParams {
    pub shell_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KillShellByTaskParams {
    pub task_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadShellLogsParams {
    pub shell_id: String,
    pub stream: Option<String>,
    pub offset: Option<usize>,
    pub limit: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchParams {
    pub search_term: String,
    pub provider: Option<String>,
    pub api_key_source: Option<String>,
    pub api_key: Option<String>,
    pub api_key_env_var: Option<String>,
    pub searxng_base_url: Option<String>,
    pub allow_private_network: Option<bool>,
    pub max_results: Option<u8>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowsePageParams {
    pub url: String,
    pub start_line: Option<u32>,
    pub max_lines: Option<u32>,
    pub allow_private_network: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTreeParams {
    pub workspace_dir: Option<String>,
    pub start_line: Option<u32>,
    pub max_lines: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchWorkspacePathsParams {
    pub workspace_dir: Option<String>,
    pub query: Option<String>,
    pub head_limit: Option<u32>,
    pub respect_gitignore: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizeExternalPathParams {
    pub absolute_path: String,
    pub workspace_dir: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveAbsolutePathParams {
    pub workspace_dir: Option<String>,
    pub path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadLocalImageBytesParams {
    pub path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveEnvVarParams {
    pub name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestRemoteConnectionParams {
    pub config: crate::tools::remote_connection::RemoteTargetConfig,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCurrentBranchParams {
    pub workspace_dir: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendEmailParams {
    pub settings: crate::tools::mail::EmailSettings,
    pub to: String,
    pub subject: String,
    pub body: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStartParams {
    pub task_id: String,
    pub base_url: String,
    pub api_key: Option<String>,
    pub api_key_source: Option<String>,
    pub api_key_env_var: Option<String>,
    pub model: String,
    #[serde(default)]
    pub messages: Option<Vec<agent::ChatMessage>>,
    pub tools: Option<Vec<agent::AgentToolDefinition>>,
    pub request_extensions: Option<Value>,
    pub session_id: Option<String>,
    pub emit_assistant_output: Option<bool>,
    pub max_context_tokens: Option<u32>,
    pub compact_trigger_threshold: Option<f64>,
    pub thinking_enabled: Option<bool>,
    pub models: Option<Vec<Value>>,
    pub session_kind: Option<String>,
    pub autonomy_mode: Option<String>,
    pub decision_policy_version: Option<String>,
    pub decision_model: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSendParams {
    pub session_id: String,
    pub content: String,
    #[serde(default)]
    pub images: Option<Vec<crate::db::records::MessageImageAttachment>>,
    #[serde(default)]
    pub edit_message_id: Option<String>,
    #[serde(default)]
    pub referenced_skills: Option<Vec<String>>,
    pub base_url: String,
    pub api_key: Option<String>,
    pub api_key_source: Option<String>,
    pub api_key_env_var: Option<String>,
    pub model: String,
    pub request_extensions: Option<Value>,
    #[serde(default)]
    pub max_context_tokens: Option<u32>,
    #[serde(default)]
    pub compact_trigger_threshold: Option<f64>,
    #[serde(default)]
    pub thinking_enabled: Option<bool>,
    #[serde(default)]
    pub models: Option<Vec<Value>>,
    #[serde(default)]
    pub extra_tools: Option<Vec<agent::AgentToolDefinition>>,
    #[serde(default)]
    pub denied_tools: Option<Vec<String>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRegenerateParams {
    pub session_id: String,
    pub assistant_message_id: String,
    pub base_url: String,
    pub api_key: Option<String>,
    pub api_key_source: Option<String>,
    pub api_key_env_var: Option<String>,
    pub model: String,
    pub request_extensions: Option<Value>,
    #[serde(default)]
    pub max_context_tokens: Option<u32>,
    #[serde(default)]
    pub compact_trigger_threshold: Option<f64>,
    #[serde(default)]
    pub thinking_enabled: Option<bool>,
    #[serde(default)]
    pub models: Option<Vec<Value>>,
    #[serde(default)]
    pub extra_tools: Option<Vec<agent::AgentToolDefinition>>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentMutationResponse {
    pub user_message_id: String,
    pub assistant_message_id: String,
    pub task_id: String,
    pub deleted_message_ids: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCancelParams {
    pub task_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatusParams {
    pub task_id: String,
}

#[derive(Deserialize)]
pub struct AgentAskQuestionResponseAnswer {
    pub question_id: String,
    pub prompt: String,
    pub allow_multiple: bool,
    pub selected_option_ids: Vec<String>,
    pub selected_option_labels: Vec<String>,
    pub other_text: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAskQuestionResponseParams {
    pub task_id: String,
    pub answers: Vec<AgentAskQuestionResponseAnswer>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateSessionTitleParams {
    pub base_url: String,
    pub api_key: Option<String>,
    pub api_key_source: Option<String>,
    pub api_key_env_var: Option<String>,
    pub model: String,
    pub user_message: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefinePromptParams {
    pub base_url: String,
    pub api_key: Option<String>,
    pub api_key_source: Option<String>,
    pub api_key_env_var: Option<String>,
    pub model: String,
    pub user_prompt: String,
    pub system_prompt: String,
    pub context_messages: Vec<agent::RefineContextMessage>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnhancePromptParams {
    pub base_url: String,
    pub api_key: Option<String>,
    pub api_key_source: Option<String>,
    pub api_key_env_var: Option<String>,
    pub model: String,
    pub user_prompt: String,
    pub system_prompt: String,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// POST /api/list_dir
pub async fn handle_list_dir(
    State(state): State<Arc<AppState>>,
    Json(params): Json<ListDirParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let workspace_dir = resolve_workspace_dir(params.workspace_dir, &state.workspace_dir);
    let result = tool_list_dir(
        workspace_dir,
        params.path,
        params.recursive,
        params.max_depth,
        params.show_hidden,
    )
    .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/read_file
pub async fn handle_read_file(
    State(state): State<Arc<AppState>>,
    Json(params): Json<ReadFileParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let workspace_dir = resolve_workspace_dir(params.workspace_dir, &state.workspace_dir);
    let result = tool_read_file(
        workspace_dir,
        params.path,
        params.start_line,
        params.max_lines,
        params.numbered,
    )
    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/create_file
pub async fn handle_create_file(
    State(state): State<Arc<AppState>>,
    Json(params): Json<CreateFileParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let workspace_dir = resolve_workspace_dir(params.workspace_dir, &state.workspace_dir);
    let result = tool_create_file(workspace_dir, params.path, params.content, params.create_parent_dirs)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// Legacy alias for [`handle_create_file`].
pub async fn handle_write_file(
    state: State<Arc<AppState>>,
    params: Json<CreateFileParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    handle_create_file(state, params).await
}

/// POST /api/edit_file
pub async fn handle_edit_file(
    State(state): State<Arc<AppState>>,
    Json(params): Json<EditFileParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let workspace_dir = resolve_workspace_dir(params.workspace_dir, &state.workspace_dir);
    let result = tool_edit_file(
        workspace_dir,
        params.path,
        params.old_string,
        params.new_string,
        params.expected_sha256,
        params.replace_all,
        params.create_backup,
        params.respect_gitignore,
    )
    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/replace_lines
pub async fn handle_replace_lines(
    State(state): State<Arc<AppState>>,
    Json(params): Json<ReplaceLinesParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let workspace_dir = resolve_workspace_dir(params.workspace_dir, &state.workspace_dir);
    let result = tool_replace_lines(
        workspace_dir,
        params.path,
        params.start_line,
        params.end_line,
        params.content,
        params.expected_sha256,
        params.create_backup,
        params.respect_gitignore,
    )
    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/replace_file
pub async fn handle_replace_file(
    State(state): State<Arc<AppState>>,
    Json(params): Json<ReplaceFileParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let workspace_dir = resolve_workspace_dir(params.workspace_dir, &state.workspace_dir);
    let result = tool_replace_file(
        workspace_dir,
        params.path,
        params.content,
        params.expected_sha256,
        params.create_backup,
        params.respect_gitignore,
    )
    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/glob
pub async fn handle_glob(
    State(state): State<Arc<AppState>>,
    Json(params): Json<GlobParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let workspace_dir = resolve_workspace_dir(params.workspace_dir, &state.workspace_dir);
    let result = tool_glob(
        workspace_dir,
        params.glob_pattern,
        params.target_directory,
        params.head_limit,
        params.respect_gitignore,
        params.show_hidden,
        params.offset,
    )
    .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/grep
pub async fn handle_grep(
    State(state): State<Arc<AppState>>,
    Json(params): Json<GrepParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let workspace_dir = resolve_workspace_dir(params.workspace_dir, &state.workspace_dir);
    let result = tool_grep(
        workspace_dir,
        params.pattern,
        params.path,
        params.glob,
        params.output_mode,
        params.case_insensitive,
        params.context_before,
        params.context_after,
        params.context,
        params.head_limit,
        params.offset,
        params.multiline,
        params.respect_gitignore,
        params.show_hidden,
    )
    .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/shell
pub async fn handle_shell(
    State(state): State<Arc<AppState>>,
    Json(params): Json<ShellParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let workspace_dir = resolve_workspace_dir(params.workspace_dir, &state.workspace_dir);
    let result = tool_shell(
        state.shell_registry.clone(),
        Some(state.sse_broadcaster.clone()),
        workspace_dir,
        params.command,
        params.description,
        params.working_directory,
        params.block_until_ms,
        params.task_id,
    )
    .await
    .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/remote_shell
pub async fn handle_remote_shell(
    State(state): State<Arc<AppState>>,
    Json(params): Json<RemoteShellParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let result = tool_remote_shell(
        state.shell_registry.clone(),
        &state.remote_pool,
        Some(state.sse_broadcaster.clone()),
        params.command,
        params.description,
        params.config,
        params.block_until_ms,
        params.task_id,
    )
    .await
    .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/await_shell
pub async fn handle_await_shell(
    State(state): State<Arc<AppState>>,
    Json(params): Json<AwaitShellParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let result = tool_await(
        state.shell_registry.clone(),
        params.shell_id,
        params.block_until_ms,
    )
    .await
    .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/list_shells
pub async fn handle_list_shells(
    State(state): State<Arc<AppState>>,
    Json(params): Json<ListShellsParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let status_filter = params
        .status_filter
        .map(|s| match s.to_ascii_lowercase().as_str() {
            "running" => crate::tools::shell::ShellStatusFilter::Running,
            "completed" => crate::tools::shell::ShellStatusFilter::Completed,
            "failed" => crate::tools::shell::ShellStatusFilter::Failed,
            "timeout" => crate::tools::shell::ShellStatusFilter::Timeout,
            "cancelled" => crate::tools::shell::ShellStatusFilter::Cancelled,
            _ => crate::tools::shell::ShellStatusFilter::All,
        });
    let result =
        shell_list(&state.shell_registry, status_filter).map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/kill_shell
pub async fn handle_kill_shell(
    State(state): State<Arc<AppState>>,
    Json(params): Json<KillShellParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    shell_kill(&state.shell_registry, params.shell_id)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(serde_json::json!({"ok": true})).map_err(
        |e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    )?))
}

/// POST /api/kill_shell_by_task
pub async fn handle_kill_shell_by_task(
    State(state): State<Arc<AppState>>,
    Json(params): Json<KillShellByTaskParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let count = shell_kill_by_task(&state.shell_registry, params.task_id)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(serde_json::json!({"killed": count})).map_err(
        |e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    )?))
}

/// POST /api/read_shell_logs
pub async fn handle_read_shell_logs(
    State(state): State<Arc<AppState>>,
    Json(params): Json<ReadShellLogsParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let result = shell_read_logs(
        &state.shell_registry,
        params.shell_id,
        params.stream,
        params.offset,
        params.limit,
    )
    .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/web_search
pub async fn handle_web_search(
    State(_state): State<Arc<AppState>>,
    Json(params): Json<WebSearchParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let result = tool_web_search(
        params.search_term,
        params.provider,
        params.api_key_source,
        params.api_key,
        params.api_key_env_var,
        params.searxng_base_url,
        params.allow_private_network,
        params.max_results,
    )
    .await
    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/browse_page
pub async fn handle_browse_page(
    State(state): State<Arc<AppState>>,
    Json(params): Json<BrowsePageParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let result = tool_browse_page(
        &state.page_cache,
        params.url,
        params.start_line,
        params.max_lines,
        params.allow_private_network,
    )
    .await
    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/get_workspace_tree
pub async fn handle_workspace_tree(
    State(state): State<Arc<AppState>>,
    Json(params): Json<WorkspaceTreeParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let workspace_dir = resolve_workspace_dir(params.workspace_dir, &state.workspace_dir);
    let result = tool_get_workspace_tree(workspace_dir, params.start_line, params.max_lines)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/search_workspace_paths
pub async fn handle_search_workspace_paths(
    State(state): State<Arc<AppState>>,
    Json(params): Json<SearchWorkspacePathsParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let workspace_dir = resolve_workspace_dir(params.workspace_dir, &state.workspace_dir);
    let result = tool_search_workspace_paths(
        workspace_dir,
        params.query,
        params.head_limit,
        params.respect_gitignore,
    )
    .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/normalize_external_path
pub async fn handle_normalize_external_path(
    State(state): State<Arc<AppState>>,
    Json(params): Json<NormalizeExternalPathParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let workspace_dir = Some(resolve_workspace_dir(
        params.workspace_dir,
        &state.workspace_dir,
    ));
    let result = tool_normalize_external_path(workspace_dir, params.absolute_path)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/resolve_absolute_path
pub async fn handle_resolve_absolute_path(
    State(state): State<Arc<AppState>>,
    Json(params): Json<ResolveAbsolutePathParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let workspace_dir = resolve_workspace_dir(params.workspace_dir, &state.workspace_dir);
    let result = tool_resolve_absolute_path(workspace_dir, params.path)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/read_local_image_bytes
pub async fn handle_read_local_image_bytes(
    State(_state): State<Arc<AppState>>,
    Json(params): Json<ReadLocalImageBytesParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let result = tool_read_local_image_bytes(params.path)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/resolve_env_var
pub async fn handle_resolve_env_var(
    State(_state): State<Arc<AppState>>,
    Json(params): Json<ResolveEnvVarParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let args = crate::tools::env::ResolveEnvVarArgs { name: params.name };
    let result = resolve_env_var(args).map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeEnvironmentParams {
    pub workspace_dir: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSystemPromptParams {
    pub session_id: String,
    #[serde(default)]
    pub workspace_dir: Option<String>,
}

/// POST /api/runtime_environment
pub async fn handle_runtime_environment(
    State(state): State<Arc<AppState>>,
    Json(params): Json<RuntimeEnvironmentParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let workspace_dir = Some(resolve_workspace_dir(params.workspace_dir, &state.workspace_dir));
    let result = agent_get_runtime_environment(workspace_dir)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/agent/system_prompt
pub async fn handle_agent_system_prompt(
    State(state): State<Arc<AppState>>,
    Json(params): Json<AgentSystemPromptParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = state
        .db
        .lock()
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned".to_string()))?;
    let session = get_session(&db, &params.session_id)
        .map_err(|error| (StatusCode::BAD_REQUEST, error))?
        .ok_or_else(|| (StatusCode::BAD_REQUEST, format!("Session not found: {}", params.session_id)))?;
    drop(db);

    let system_prompt = agent::build_system_prompt_preview(
        &state,
        &session,
        params.workspace_dir.as_deref(),
    )
    .map_err(|error| (StatusCode::BAD_REQUEST, error))?;
    Ok(Json(serde_json::json!({ "systemPrompt": system_prompt })))
}

/// POST /api/test_remote_connection
pub async fn handle_test_remote_connection(
    State(_state): State<Arc<AppState>>,
    Json(params): Json<TestRemoteConnectionParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let result = test_remote_connection(params.config)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/git_current_branch
pub async fn handle_git_current_branch(
    State(_state): State<Arc<AppState>>,
    Json(params): Json<GitCurrentBranchParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let result = git_current_branch(params.workspace_dir)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/git_snapshot
pub async fn handle_git_snapshot(
    State(_state): State<Arc<AppState>>,
    Json(params): Json<GitSnapshotParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let _validated = validate_workspace_dir(&params.workspace_dir)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    let result = tool_collect_git_snapshot(&params.workspace_dir)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

#[derive(Deserialize)]
pub struct ValidateWorkspaceDirParams {
    pub path: String,
}

/// POST /api/validate_workspace_dir
pub async fn handle_validate_workspace_dir(
    State(_state): State<Arc<AppState>>,
    Json(params): Json<ValidateWorkspaceDirParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let path = validate_workspace_dir(&params.path).map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::json!({ "path": path })))
}

#[derive(Deserialize)]
pub struct OpenInExplorerParams {
    pub path: String,
}

/// POST /api/open_in_explorer
pub async fn handle_open_in_explorer(
    State(_state): State<Arc<AppState>>,
    Json(params): Json<OpenInExplorerParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    open_in_explorer(&params.path).map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

#[derive(Deserialize)]
pub struct BrowseDirectoriesParams {
    pub path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDiagnosticLogParams {
    pub category: String,
    pub session_id: Option<String>,
    pub task_id: Option<String>,
    pub payload: Value,
}

/// POST /api/browse_directories
pub async fn handle_browse_directories(
    State(_state): State<Arc<AppState>>,
    Json(params): Json<BrowseDirectoriesParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let result = tool_browse_directories(params.path)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/agent_diagnostic_log
pub async fn handle_agent_diagnostic_log(
    State(_state): State<Arc<AppState>>,
    Json(params): Json<AgentDiagnosticLogParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let category = params.category.trim();
    if category.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "category is required".to_string(),
        ));
    }

    let entry = serde_json::json!({
        "ts": Utc::now().to_rfc3339(),
        "category": category,
        "sessionId": params.session_id.and_then(|value| {
            let trimmed = value.trim().to_string();
            (!trimmed.is_empty()).then_some(trimmed)
        }),
        "taskId": params.task_id.and_then(|value| {
            let trimmed = value.trim().to_string();
            (!trimmed.is_empty()).then_some(trimmed)
        }),
        "payload": params.payload,
    });

    agent::agent_diagnostic_file_log(entry.to_string());
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// POST /api/send_email
pub async fn handle_send_email(
    State(_state): State<Arc<AppState>>,
    Json(params): Json<SendEmailParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let request = crate::tools::mail::SendEmailRequest {
        settings: params.settings,
        to: params.to,
        subject: params.subject,
        body: params.body,
    };
    let result = send_email(request).await.map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// GET /api/server_info
pub async fn handle_server_info(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let info = serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
    });
    Ok(Json(info))
}

// ---------------------------------------------------------------------------
// Agent handlers
// ---------------------------------------------------------------------------

/// POST /agent/start
pub async fn handle_agent_start(
    State(state): State<Arc<AppState>>,
    Json(params): Json<AgentStartParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let session = params
        .session_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(|session_id| {
            let db = state
                .db
                .lock()
                .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned".to_string()))?;
            get_session(&db, session_id)
                .map_err(|error| (StatusCode::BAD_REQUEST, error))?
                .ok_or_else(|| (StatusCode::BAD_REQUEST, format!("Session not found: {session_id}")))
        })
        .transpose()?;
    let messages = match params.messages.clone().filter(|items| !items.is_empty()) {
        Some(messages) => messages,
        None => {
            let session = session.as_ref().ok_or_else(|| {
                (
                    StatusCode::BAD_REQUEST,
                    "messages or sessionId is required".to_string(),
                )
            })?;
            agent::assemble_agent_messages(&state, session)
                .map_err(|error| (StatusCode::BAD_REQUEST, error))?
        }
    };
    let tools = {
        let defaults = agent::resolve_agent_tool_definitions(
            &state,
            params.tools.clone(),
            None,
            params.session_id.as_deref(),
        )
        .await;
        (!defaults.is_empty()).then_some(defaults)
    };
    if let Some((user_message_count, preview_chars, preview)) = summarize_latest_user_message(&messages) {
        log::info!(
            "agent_start task_id={} session_id={:?} model={} tools={} user_messages={} preview_chars={} preview={:?}",
            params.task_id,
            params.session_id,
            params.model,
            tools.as_ref().map(|items| items.len()).unwrap_or(0),
            user_message_count,
            preview_chars,
            preview
        );
    } else {
        log::info!(
            "agent_start task_id={} session_id={:?} model={} tools={} user_messages=0",
            params.task_id,
            params.session_id,
            params.model,
            tools.as_ref().map(|items| items.len()).unwrap_or(0)
        );
    }
    let agent_params = agent::AgentStartParams {
        task_id: params.task_id,
        base_url: params.base_url,
        api_key: params.api_key,
        api_key_source: params.api_key_source.unwrap_or_else(|| "manual".to_string()),
        api_key_env_var: params.api_key_env_var.unwrap_or_else(|| "OPENAI_API_KEY".to_string()),
        model: params.model,
        messages,
        tools,
        request_extensions: params.request_extensions,
        session_id: params.session_id,
        emit_assistant_output: params.emit_assistant_output,
        max_context_tokens: params.max_context_tokens,
        compact_trigger_threshold: params.compact_trigger_threshold,
        thinking_enabled: params.thinking_enabled,
        models: params.models,
        session_kind: params.session_kind,
        autonomy_mode: params.autonomy_mode,
        decision_policy_version: params.decision_policy_version,
        decision_model: params.decision_model,
    };
    agent::agent_start(
        &state.agent_registry,
        agent_params,
        state.sse_broadcaster.clone(),
        state.clone(),
    )
    .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(serde_json::json!({"ok": true})).map_err(
        |e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    )?))
}

/// POST /api/agent/send
pub async fn start_agent_send_with_task_id(
    state: Arc<AppState>,
    params: AgentSendParams,
    task_id: String,
) -> Result<AgentMutationResponse, (StatusCode, String)> {
    let trimmed = params.content.trim().to_string();
    let images = params.images.clone().unwrap_or_default();
    if trimmed.is_empty() && images.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Message content is required".to_string()));
    }

    cancel_active_session_task(&state, &params.session_id).await;

    let (updated_session, user_message, assistant_message, deleted_message_ids) = {
        let db = state
            .db
            .lock()
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned".to_string()))?;
        let session = get_session(&db, &params.session_id)
            .map_err(|error| (StatusCode::BAD_REQUEST, error))?
            .ok_or_else(|| (StatusCode::BAD_REQUEST, format!("Session not found: {}", params.session_id)))?;
        let workspace_dir = session
            .workspace_dir
            .clone()
            .or_else(|| session_fallback_workspace_dir(&state));
        let updated_session = update_session(&db, &params.session_id, |record| {
            record.model = params.model.trim().to_string();
            record.decision_model = Some(params.model.trim().to_string());
            record.provider = normalize_provider("", &params.model);
            record.workspace_dir = workspace_dir.clone();
            record.context_usage_snapshot = None;
        })
        .map_err(|error| (StatusCode::BAD_REQUEST, error))?
        .ok_or_else(|| (StatusCode::BAD_REQUEST, format!("Session not found: {}", params.session_id)))?;

        let existing_messages = get_messages_by_session(&db, &params.session_id)
            .map_err(|error| (StatusCode::BAD_REQUEST, error))?;
        let (user_message, is_first_turn, deleted_message_ids) = if let Some(edit_message_id) =
            params.edit_message_id.as_deref()
        {
            let edit_index = existing_messages
                .iter()
                .position(|message| message.id == edit_message_id)
                .ok_or_else(|| (StatusCode::BAD_REQUEST, format!("Message not found: {edit_message_id}")))?;
            let message_to_edit = existing_messages
                .get(edit_index)
                .ok_or_else(|| (StatusCode::BAD_REQUEST, format!("Message not found: {edit_message_id}")))?;
            if message_to_edit.role != "user" {
                return Err((StatusCode::BAD_REQUEST, "Only user messages can be edited".to_string()));
            }
            let deleted_message_ids = delete_messages_after(&db, &params.session_id, edit_message_id)
                .map_err(|error| (StatusCode::BAD_REQUEST, error))?;
            let updated = update_message(&db, edit_message_id, true, |message| {
                message.content = trimmed.clone();
                message.images = (!images.is_empty()).then_some(images.clone());
                message.referenced_skills = normalize_skill_references(params.referenced_skills.clone());
            })
            .map_err(|error| (StatusCode::BAD_REQUEST, error))?
            .ok_or_else(|| (StatusCode::BAD_REQUEST, format!("Message not found: {edit_message_id}")))?;
            (updated, edit_index == 0, deleted_message_ids)
        } else {
            let message = MessageRecord {
                id: new_message_id(),
                session_id: params.session_id.clone(),
                role: "user".to_string(),
                message_kind: None,
                content: trimmed.clone(),
                images: (!images.is_empty()).then_some(images.clone()),
                referenced_skills: normalize_skill_references(params.referenced_skills.clone()),
                thinking: String::new(),
                process_steps: None,
                tool_invocations: Vec::new(),
                status: "completed".to_string(),
                task_id: None,
                error: None,
                created_at: current_timestamp_ms(),
                duration_ms: None,
                usage: None,
            };
            put_message(&db, &message, true).map_err(|error| (StatusCode::BAD_REQUEST, error))?;
            (message, existing_messages.is_empty(), Vec::new())
        };

        if is_first_turn {
            let derived_title = derive_session_title(&trimmed, 48);
            if !derived_title.is_empty() {
                let _ = update_session(&db, &params.session_id, |record| {
                    record.title = derived_title.clone();
                });
            }
        }

        let assistant_message = MessageRecord {
            id: new_message_id(),
            session_id: params.session_id.clone(),
            role: "assistant".to_string(),
            message_kind: None,
            content: String::new(),
            images: None,
            referenced_skills: None,
            thinking: String::new(),
            process_steps: Some(Vec::new()),
            tool_invocations: Vec::new(),
            status: "pending".to_string(),
            task_id: Some(task_id.clone()),
            error: None,
            created_at: current_timestamp_ms(),
            duration_ms: None,
            usage: None,
        };
        put_message(&db, &assistant_message, true).map_err(|error| (StatusCode::BAD_REQUEST, error))?;
        (updated_session, user_message, assistant_message, deleted_message_ids)
    };

    let history = agent::assemble_agent_messages(&state, &updated_session)
        .map_err(|error| (StatusCode::BAD_REQUEST, error))?;
    let tools = agent::resolve_agent_tool_definitions(
        &state,
        params.extra_tools.clone(),
        params.denied_tools.clone(),
        Some(&params.session_id),
    )
    .await;
    let agent_params = agent::AgentStartParams {
        task_id: task_id.clone(),
        base_url: params.base_url,
        api_key: params.api_key,
        api_key_source: params.api_key_source.unwrap_or_else(|| "manual".to_string()),
        api_key_env_var: params.api_key_env_var.unwrap_or_else(|| "OPENAI_API_KEY".to_string()),
        model: params.model.clone(),
        messages: history,
        tools: (!tools.is_empty()).then_some(tools),
        request_extensions: params.request_extensions,
        session_id: Some(params.session_id.clone()),
        emit_assistant_output: Some(true),
        max_context_tokens: params.max_context_tokens,
        compact_trigger_threshold: params.compact_trigger_threshold,
        thinking_enabled: params.thinking_enabled,
        models: params.models,
        session_kind: Some(updated_session.session_kind.clone()),
        autonomy_mode: Some(updated_session.autonomy_mode.clone()),
        decision_policy_version: Some(updated_session.decision_policy_version.clone()),
        decision_model: updated_session.decision_model.clone(),
    };
    if let Err(error) = agent::agent_start(
        &state.agent_registry,
        agent_params,
        state.sse_broadcaster.clone(),
        state.clone(),
    ) {
        let db = state
            .db
            .lock()
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned".to_string()))?;
        let _ = update_message(&db, &assistant_message.id, true, |message| {
            message.status = "failed".to_string();
            message.error = Some(error.clone());
        });
        return Err((StatusCode::BAD_REQUEST, error));
    }

    Ok(AgentMutationResponse {
        user_message_id: user_message.id,
        assistant_message_id: assistant_message.id,
        task_id,
        deleted_message_ids,
    })
}

pub async fn start_agent_send(
    state: Arc<AppState>,
    params: AgentSendParams,
) -> Result<AgentMutationResponse, (StatusCode, String)> {
    start_agent_send_with_task_id(state, params, Uuid::new_v4().to_string()).await
}

pub async fn handle_agent_send(
    State(state): State<Arc<AppState>>,
    Json(params): Json<AgentSendParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let response = start_agent_send(state, params).await?;
    Ok(Json(
        serde_json::to_value(response)
            .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?,
    ))
}

/// POST /api/agent/regenerate
pub async fn handle_agent_regenerate(
    State(state): State<Arc<AppState>>,
    Json(params): Json<AgentRegenerateParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    cancel_active_session_task(&state, &params.session_id).await;

    let task_id = Uuid::new_v4().to_string();
    let (updated_session, user_message, assistant_message, deleted_message_ids) = {
        let db = state
            .db
            .lock()
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned".to_string()))?;
        let session = get_session(&db, &params.session_id)
            .map_err(|error| (StatusCode::BAD_REQUEST, error))?
            .ok_or_else(|| (StatusCode::BAD_REQUEST, format!("Session not found: {}", params.session_id)))?;
        let session_messages = get_messages_by_session(&db, &params.session_id)
            .map_err(|error| (StatusCode::BAD_REQUEST, error))?;
        let assistant_index = session_messages
            .iter()
            .position(|message| message.id == params.assistant_message_id)
            .ok_or_else(|| (StatusCode::BAD_REQUEST, format!("Message not found: {}", params.assistant_message_id)))?;
        let target_assistant = session_messages
            .get(assistant_index)
            .ok_or_else(|| (StatusCode::BAD_REQUEST, format!("Message not found: {}", params.assistant_message_id)))?;
        if target_assistant.role != "assistant" {
            return Err((StatusCode::BAD_REQUEST, "Only assistant messages can be regenerated".to_string()));
        }
        let user_index = (0..assistant_index)
            .rev()
            .find(|index| session_messages[*index].role == "user")
            .ok_or_else(|| {
                (
                    StatusCode::BAD_REQUEST,
                    "No user message found before assistant message".to_string(),
                )
            })?;
        let user_message = session_messages[user_index].clone();
        let deleted_message_ids = delete_messages_after(&db, &params.session_id, &user_message.id)
            .map_err(|error| (StatusCode::BAD_REQUEST, error))?;
        let workspace_dir = session
            .workspace_dir
            .clone()
            .or_else(|| session_fallback_workspace_dir(&state));
        let updated_session = update_session(&db, &params.session_id, |record| {
            record.model = params.model.trim().to_string();
            record.decision_model = Some(params.model.trim().to_string());
            record.provider = normalize_provider("", &params.model);
            record.workspace_dir = workspace_dir.clone();
            record.context_usage_snapshot = None;
        })
        .map_err(|error| (StatusCode::BAD_REQUEST, error))?
        .ok_or_else(|| (StatusCode::BAD_REQUEST, format!("Session not found: {}", params.session_id)))?;
        let assistant_message = MessageRecord {
            id: new_message_id(),
            session_id: params.session_id.clone(),
            role: "assistant".to_string(),
            message_kind: None,
            content: String::new(),
            images: None,
            referenced_skills: None,
            thinking: String::new(),
            process_steps: Some(Vec::new()),
            tool_invocations: Vec::new(),
            status: "pending".to_string(),
            task_id: Some(task_id.clone()),
            error: None,
            created_at: current_timestamp_ms(),
            duration_ms: None,
            usage: None,
        };
        put_message(&db, &assistant_message, true).map_err(|error| (StatusCode::BAD_REQUEST, error))?;
        (updated_session, user_message, assistant_message, deleted_message_ids)
    };

    let history = agent::assemble_agent_messages(&state, &updated_session)
        .map_err(|error| (StatusCode::BAD_REQUEST, error))?;
    let tools = agent::resolve_agent_tool_definitions(
        &state,
        params.extra_tools.clone(),
        None,
        Some(&params.session_id),
    )
    .await;
    let agent_params = agent::AgentStartParams {
        task_id: task_id.clone(),
        base_url: params.base_url,
        api_key: params.api_key,
        api_key_source: params.api_key_source.unwrap_or_else(|| "manual".to_string()),
        api_key_env_var: params.api_key_env_var.unwrap_or_else(|| "OPENAI_API_KEY".to_string()),
        model: params.model.clone(),
        messages: history,
        tools: (!tools.is_empty()).then_some(tools),
        request_extensions: params.request_extensions,
        session_id: Some(params.session_id.clone()),
        emit_assistant_output: Some(true),
        max_context_tokens: params.max_context_tokens,
        compact_trigger_threshold: params.compact_trigger_threshold,
        thinking_enabled: params.thinking_enabled,
        models: params.models,
        session_kind: Some(updated_session.session_kind.clone()),
        autonomy_mode: Some(updated_session.autonomy_mode.clone()),
        decision_policy_version: Some(updated_session.decision_policy_version.clone()),
        decision_model: updated_session.decision_model.clone(),
    };
    if let Err(error) = agent::agent_start(
        &state.agent_registry,
        agent_params,
        state.sse_broadcaster.clone(),
        state.clone(),
    ) {
        let db = state
            .db
            .lock()
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned".to_string()))?;
        let _ = update_message(&db, &assistant_message.id, true, |message| {
            message.status = "failed".to_string();
            message.error = Some(error.clone());
        });
        return Err((StatusCode::BAD_REQUEST, error));
    }

    Ok(Json(serde_json::to_value(AgentMutationResponse {
        user_message_id: user_message.id,
        assistant_message_id: assistant_message.id,
        task_id,
        deleted_message_ids,
    })
    .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?))
}

/// POST /agent/cancel
pub async fn handle_agent_cancel(
    State(state): State<Arc<AppState>>,
    Json(params): Json<AgentCancelParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    // Cancel the current task.
    let _ = state.ask_question_registry.cancel(&params.task_id, "Cancelled");
    agent::agent_cancel(&state.agent_registry, params.task_id.clone())
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    let _ = shell_kill_by_task(&state.shell_registry, params.task_id.clone());

    // Q9: cascade cancel child sessions (SubAgent). Find the session_id from
    // the task_id via the assistant message, then cancel the whole subtree.
    let session_id = {
        let db = state
            .db
            .lock()
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned".to_string()))?;
        crate::db::session_store::find_assistant_message_by_task_id(&db, None, &params.task_id)
            .ok()
            .flatten()
            .map(|m| m.session_id)
    };
    if let Some(session_id) = session_id {
        let _ = crate::agent::cancel::cancel_session_and_children(&state, &session_id).await;
    }

    Ok(Json(serde_json::to_value(serde_json::json!({"ok": true})).map_err(
        |e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    )?))
}

/// POST /api/agent/ask_question/respond
pub async fn handle_agent_ask_question_response(
    State(state): State<Arc<AppState>>,
    Json(params): Json<AgentAskQuestionResponseParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let answers = params
        .answers
        .into_iter()
        .map(|answer| crate::agent::ask_question::AskQuestionAnswer {
            question_id: answer.question_id,
            prompt: answer.prompt,
            allow_multiple: answer.allow_multiple,
            selected_option_ids: answer.selected_option_ids,
            selected_option_labels: answer.selected_option_labels,
            other_text: answer.other_text,
        })
        .collect::<Vec<_>>();

    let submitted = state
        .ask_question_registry
        .submit(&params.task_id, answers)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    if !submitted {
        return Err((
            StatusCode::BAD_REQUEST,
            "No pending ask_question request for that task.".to_string(),
        ));
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// POST /agent/status
pub async fn handle_agent_status(
    State(state): State<Arc<AppState>>,
    Json(params): Json<AgentStatusParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let result = agent::agent_get_status(&state.agent_registry, params.task_id)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// GET /api/agent/session/{session_id}/status
pub async fn handle_agent_session_status(
    Path(session_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let result = agent::agent_get_session_status(&state.agent_registry, session_id.clone())
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    let payload = match result {
        Some(status) => serde_json::json!({
            "running": true,
            "taskId": status.task_id,
            "status": status.status,
            "lastSeq": status.last_seq,
        }),
        None => {
            // The run is not tracked in the registry (finished/cancelled, or
            // this process never hosted it). Fall back to the DB so callers can
            // still learn the terminal status — required for resuming after a
            // browser reconnect where the live SSE replay is unavailable.
            let db_status = state
                .db
                .lock()
                .ok()
                .and_then(|db| {
                    crate::db::session_store::latest_assistant_message_status(&db, &session_id)
                        .ok()
                        .flatten()
                });
            match db_status {
                Some(status) => serde_json::json!({ "running": false, "status": status }),
                None => serde_json::json!({ "running": false }),
            }
        }
    };
    Ok(Json(payload))
}

/// POST /agent/generate_title
pub async fn handle_generate_session_title(
    State(state): State<Arc<AppState>>,
    Json(params): Json<GenerateSessionTitleParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let agent_params = agent::GenerateSessionTitleParams {
        base_url: params.base_url,
        api_key: params.api_key,
        api_key_source: params.api_key_source.unwrap_or_else(|| "manual".to_string()),
        api_key_env_var: params.api_key_env_var.unwrap_or_else(|| "OPENAI_API_KEY".to_string()),
        model: params.model,
        user_message: params.user_message,
    };
    let result = agent::agent_generate_session_title(&state.agent_registry, agent_params)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /agent/refine_prompt
pub async fn handle_refine_prompt(
    State(state): State<Arc<AppState>>,
    Json(params): Json<RefinePromptParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let agent_params = agent::RefinePromptParams {
        base_url: params.base_url,
        api_key: params.api_key,
        api_key_source: params.api_key_source.unwrap_or_else(|| "manual".to_string()),
        api_key_env_var: params.api_key_env_var.unwrap_or_else(|| "OPENAI_API_KEY".to_string()),
        model: params.model,
        user_prompt: params.user_prompt,
        system_prompt: params.system_prompt,
        context_messages: params.context_messages,
    };
    let result = agent::agent_refine_prompt(&state.agent_registry, agent_params)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// Wraps an inner stream and cancels the upstream LLM request when the SSE
/// connection is dropped (client disconnect or stream completion).
struct CancellableStream {
    inner: Pin<Box<dyn Stream<Item = Result<Event, Infallible>> + Send>>,
    cancel: CancellationToken,
}

impl Stream for CancellableStream {
    type Item = Result<Event, Infallible>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();
        this.inner.as_mut().poll_next(cx)
    }
}

impl Drop for CancellableStream {
    fn drop(&mut self) {
        self.cancel.cancel();
    }
}

/// POST /api/agent/enhance_prompt
///
/// Streams an improved version of the user's prompt from the configured model.
/// Each server-sent event is `data: {"type":"delta","text":"..."}`; the stream
/// ends with `data: {"type":"done"}` (or `{"type":"error","message":"..."}`).
pub async fn handle_enhance_prompt(
    Json(params): Json<EnhancePromptParams>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let cancel = CancellationToken::new();
    let cancel_for_stream = cancel.clone();

    let stream = async_stream::stream! {
        let api_key_source = params.api_key_source.clone().unwrap_or_else(|| "manual".to_string());
        let api_key_env_var = params.api_key_env_var.clone().unwrap_or_else(|| "OPENAI_API_KEY".to_string());

        let api_key = match crate::agent::registry::resolve_api_key(
            &api_key_source,
            params.api_key.as_deref(),
            &api_key_env_var,
        ) {
            Ok(key) => key,
            Err(e) => {
                yield Ok(Event::default().data(
                    json!({ "type": "error", "message": e }).to_string(),
                ));
                return;
            }
        };

        if params.base_url.trim().is_empty() {
            yield Ok(Event::default().data(
                json!({ "type": "error", "message": "Base URL is required" }).to_string(),
            ));
            return;
        }

        if params.model.trim().is_empty() {
            yield Ok(Event::default().data(
                json!({ "type": "error", "message": "Model is required" }).to_string(),
            ));
            return;
        }

        let user_prompt = params.user_prompt.trim();
        if user_prompt.is_empty() {
            // Nothing to enhance — end cleanly.
            yield Ok(Event::default().data(r#"{"type":"done"}"#));
            return;
        }

        let system_prompt = if params.system_prompt.trim().is_empty() {
            crate::agent::registry::ENHANCE_PROMPT_SYSTEM_PROMPT.to_string()
        } else {
            params.system_prompt.trim().to_string()
        };

        let client = match crate::agent::openai::build_http_client() {
            Ok(client) => client,
            Err(e) => {
                yield Ok(Event::default().data(
                    json!({ "type": "error", "message": e }).to_string(),
                ));
                return;
            }
        };

        let url = crate::agent::openai::chat_completions_url(&params.base_url);
        let model = params.model.trim().split_once("::").map_or(params.model.trim(), |(_, id)| id).to_string();
        let messages = crate::agent::registry::build_enhance_messages(user_prompt, &system_prompt);

        let (tx, mut rx) = mpsc::channel::<String>(128);
        let cancel_inner = cancel_for_stream.clone();

        let llm = tokio::spawn(async move {
            let emit = move |event: crate::agent::AgentEvent| {
                if let crate::agent::AgentEvent::ContentDelta { delta, .. } = event {
                    let _ = tx.try_send(delta);
                }
            };
            crate::agent::openai::stream_chat_completion(
                &client,
                url,
                &api_key,
                &model,
                &messages,
                None,
                None,
                cancel_inner,
                emit,
                "enhance-prompt",
                true,
            )
            .await
        });

        while let Some(delta) = rx.recv().await {
            yield Ok(Event::default().data(
                json!({ "type": "delta", "text": delta }).to_string(),
            ));
        }

        match llm.await {
            Ok(Ok(())) => {
                yield Ok(Event::default().data(r#"{"type":"done"}"#));
            }
            Ok(Err(e)) => {
                yield Ok(Event::default().data(
                    json!({ "type": "error", "message": e }).to_string(),
                ));
            }
            Err(_) => {
                yield Ok(Event::default().data(r#"{"type":"done"}"#));
            }
        }
    };

    Sse::new(CancellableStream {
        inner: Box::pin(stream),
        cancel,
    })
    .keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text(r#"{"type":"heartbeat"}"#),
    )
}

/// Request body for `handle_update_session_mcp_servers`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSessionMcpServersParams {
    pub attached_mcp_servers: Vec<String>,
}

/// POST /api/agent/session/{session_id}/mcp_servers
///
/// Persists the per-session MCP attachment (on-demand model). The frontend
/// composer "+" menu calls this whenever the user toggles a server on/off for
/// the current conversation. An empty list is normalized to `None` (nothing
/// attached).
pub async fn handle_update_session_mcp_servers(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
    Json(params): Json<UpdateSessionMcpServersParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = state
        .db
        .lock()
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Database lock poisoned".to_string()))?;
    let attached: Vec<String> = params
        .attached_mcp_servers
        .iter()
        .map(|server| server.trim().to_string())
        .filter(|server| !server.is_empty())
        .collect();
    let updated = update_session(&db, &session_id, |record| {
        record.attached_mcp_servers = if attached.is_empty() {
            None
        } else {
            Some(attached.clone())
        };
    })
    .map_err(|error| (StatusCode::BAD_REQUEST, error))?
    .ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            format!("Session not found: {session_id}"),
        )
    })?;
    Ok(Json(
        serde_json::to_value(updated).map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::{Arc, Mutex};

    use crate::agent::registry::AgentRegistry;
    use crate::db::records::SessionRecord;
    use crate::db::session_store::{get_messages_by_session, get_session, new_message_id, put_message, put_session};
    use crate::scheduled_jobs::{ActiveRunRegistry, RunLock};
    use crate::tools::{McpRegistry, PageCache, RemoteConnectionPool, ShellRegistry};
    use crate::{agent, db::Database, SseBroadcaster};

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "coder-routes-tool-{label}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn create_test_state(workspace_dir: &PathBuf) -> Arc<AppState> {
        let coder_dir = temp_dir("coder-data");
        let db = Database::new(&coder_dir).expect("db");
        Arc::new(AppState {
            workspace_dir: workspace_dir.clone(),
            http_base_url: "http://127.0.0.1:9".to_string(),
            db: Arc::new(Mutex::new(db)),
            agent_registry: Arc::new(Mutex::new(AgentRegistry::new().expect("agent registry"))),
            ask_question_registry: Arc::new(agent::ask_question::AskQuestionRegistry::new()),
            shell_registry: Arc::new(Mutex::new(ShellRegistry::new())),
            mcp_registry: Arc::new(McpRegistry::new()),
            page_cache: Arc::new(PageCache::new()),
            remote_pool: RemoteConnectionPool::new(),
            sse_broadcaster: Arc::new(SseBroadcaster::new()),
            scheduled_job_lock: Arc::new(RunLock::new()),
            scheduled_job_active_runs: Arc::new(ActiveRunRegistry::new()),
        })
    }

    fn sample_session(workspace_dir: Option<String>) -> SessionRecord {
        SessionRecord {
            id: crate::db::session_store::new_session_id(),
            title: "New Chat".to_string(),
            model: "old-model".to_string(),
            provider: "custom".to_string(),
            workspace_dir,
            session_kind: "standard".to_string(),
            autonomy_mode: "interactive".to_string(),
            decision_policy_version: "mvp-v1".to_string(),
            decision_model: None,
            parent_session_id: None,
            plan_file_name: None,
            plan_built_at: None,
            context_usage_snapshot: None,
            pinned_at: None,
            attached_mcp_servers: None,
            created_at: current_timestamp_ms(),
            updated_at: current_timestamp_ms(),
        }
    }

    async fn decode_response(result: Result<Json<Value>, (StatusCode, String)>) -> Value {
        result.expect("handler success").0
    }

    #[tokio::test]
    async fn handle_agent_send_edits_user_message_and_truncates_following_history() {
        let workspace_dir = temp_dir("send-workspace");
        let state = create_test_state(&workspace_dir);
        let session = sample_session(None);
        let original_user_id = new_message_id();
        let original_assistant_id = new_message_id();
        let trailing_user_id = new_message_id();
        {
            let db = state.db.lock().expect("db");
            put_session(&db, &session).expect("put session");
            put_message(
                &db,
                &MessageRecord {
                    id: original_user_id.clone(),
                    session_id: session.id.clone(),
                    role: "user".to_string(),
                    message_kind: None,
                    content: "old content".to_string(),
                    images: None,
                    referenced_skills: None,
                    thinking: String::new(),
                    process_steps: None,
                    tool_invocations: Vec::new(),
                    status: "completed".to_string(),
                    task_id: None,
                    error: None,
                    created_at: current_timestamp_ms(),
                    duration_ms: None,
                    usage: None,
                },
                true,
            )
            .expect("put user");
            put_message(
                &db,
                &MessageRecord {
                    id: original_assistant_id.clone(),
                    session_id: session.id.clone(),
                    role: "assistant".to_string(),
                    message_kind: None,
                    content: "old answer".to_string(),
                    images: None,
                    referenced_skills: None,
                    thinking: String::new(),
                    process_steps: None,
                    tool_invocations: Vec::new(),
                    status: "completed".to_string(),
                    task_id: None,
                    error: None,
                    created_at: current_timestamp_ms(),
                    duration_ms: None,
                    usage: None,
                },
                true,
            )
            .expect("put assistant");
            put_message(
                &db,
                &MessageRecord {
                    id: trailing_user_id.clone(),
                    session_id: session.id.clone(),
                    role: "user".to_string(),
                    message_kind: None,
                    content: "later question".to_string(),
                    images: None,
                    referenced_skills: None,
                    thinking: String::new(),
                    process_steps: None,
                    tool_invocations: Vec::new(),
                    status: "completed".to_string(),
                    task_id: None,
                    error: None,
                    created_at: current_timestamp_ms(),
                    duration_ms: None,
                    usage: None,
                },
                true,
            )
            .expect("put trailing user");
        }

        let response = decode_response(
            handle_agent_send(
                State(state.clone()),
                Json(AgentSendParams {
                    session_id: session.id.clone(),
                    content: "new content".to_string(),
                    images: None,
                    edit_message_id: Some(original_user_id.clone()),
                    referenced_skills: Some(vec!["demo-skill".to_string()]),
                    base_url: "http://127.0.0.1:9".to_string(),
                    api_key: Some("test-key".to_string()),
                    api_key_source: Some("manual".to_string()),
                    api_key_env_var: Some("OPENAI_API_KEY".to_string()),
                    model: "new-model".to_string(),
                    request_extensions: None,
                    max_context_tokens: Some(32000),
                    compact_trigger_threshold: Some(0.8),
                    thinking_enabled: Some(false),
                    models: None,
                    extra_tools: None,
                    denied_tools: None,
                }),
            )
            .await,
        )
        .await;

        let response: AgentMutationResponse =
            serde_json::from_value(response).expect("decode response");
        assert_eq!(response.user_message_id, original_user_id);
        assert_eq!(response.deleted_message_ids.len(), 2);
        assert!(response.deleted_message_ids.contains(&original_assistant_id));
        assert!(response.deleted_message_ids.contains(&trailing_user_id));

        let db = state.db.lock().expect("db");
        let session_after = get_session(&db, &session.id).expect("get session").expect("session");
        assert_eq!(session_after.model, "new-model");
        assert_eq!(
            session_after.workspace_dir.as_deref(),
            Some(workspace_dir.to_string_lossy().as_ref())
        );

        let messages = get_messages_by_session(&db, &session.id).expect("messages");
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].id, original_user_id);
        assert_eq!(messages[0].content, "new content");
        assert_eq!(
            messages[0].referenced_skills.as_ref().expect("skills"),
            &vec!["demo-skill".to_string()]
        );
        assert_eq!(messages[1].id, response.assistant_message_id);
        assert_eq!(messages[1].role, "assistant");
        assert_eq!(messages[1].task_id.as_deref(), Some(response.task_id.as_str()));
    }

    #[tokio::test]
    async fn handle_agent_regenerate_truncates_from_target_user_and_creates_new_placeholder() {
        let workspace_dir = temp_dir("regenerate-workspace");
        let state = create_test_state(&workspace_dir);
        let session = sample_session(Some(workspace_dir.to_string_lossy().to_string()));
        let u1 = new_message_id();
        let a1 = new_message_id();
        let u2 = new_message_id();
        let a2 = new_message_id();
        let u3 = new_message_id();
        let a3 = new_message_id();
        {
            let db = state.db.lock().expect("db");
            put_session(&db, &session).expect("put session");
            for (id, role, content) in [
                (&u1, "user", "first"),
                (&a1, "assistant", "first answer"),
                (&u2, "user", "second"),
                (&a2, "assistant", "second answer"),
                (&u3, "user", "third"),
                (&a3, "assistant", "third answer"),
            ] {
                put_message(
                    &db,
                    &MessageRecord {
                        id: id.clone(),
                        session_id: session.id.clone(),
                        role: role.to_string(),
                        message_kind: None,
                        content: content.to_string(),
                        images: None,
                        referenced_skills: None,
                        thinking: String::new(),
                        process_steps: None,
                        tool_invocations: Vec::new(),
                        status: "completed".to_string(),
                        task_id: None,
                        error: None,
                        created_at: current_timestamp_ms(),
                        duration_ms: None,
                        usage: None,
                    },
                    true,
                )
                .expect("put message");
            }
        }

        let response = decode_response(
            handle_agent_regenerate(
                State(state.clone()),
                Json(AgentRegenerateParams {
                    session_id: session.id.clone(),
                    assistant_message_id: a2.clone(),
                    base_url: "http://127.0.0.1:9".to_string(),
                    api_key: Some("test-key".to_string()),
                    api_key_source: Some("manual".to_string()),
                    api_key_env_var: Some("OPENAI_API_KEY".to_string()),
                    model: "regen-model".to_string(),
                    request_extensions: None,
                    max_context_tokens: Some(64000),
                    compact_trigger_threshold: Some(0.8),
                    thinking_enabled: Some(false),
                    models: None,
                    extra_tools: None,
                }),
            )
            .await,
        )
        .await;

        let response: AgentMutationResponse =
            serde_json::from_value(response).expect("decode response");
        assert_eq!(response.user_message_id, u2);
        assert_eq!(response.deleted_message_ids.len(), 3);
        assert!(response.deleted_message_ids.contains(&a2));
        assert!(response.deleted_message_ids.contains(&u3));
        assert!(response.deleted_message_ids.contains(&a3));

        let db = state.db.lock().expect("db");
        let messages = get_messages_by_session(&db, &session.id).expect("messages");
        let ids = messages.iter().map(|message| message.id.as_str()).collect::<Vec<_>>();
        assert_eq!(ids, vec![u1.as_str(), a1.as_str(), u2.as_str(), response.assistant_message_id.as_str()]);
        assert_eq!(messages[3].role, "assistant");
        assert_eq!(messages[3].task_id.as_deref(), Some(response.task_id.as_str()));

        let session_after = get_session(&db, &session.id).expect("get session").expect("session");
        assert_eq!(session_after.model, "regen-model");
    }

    #[test]
    fn derive_session_title_truncates_on_character_boundaries() {
        let title = derive_session_title("自动化工具巡检任务", 6);
        assert_eq!(title, "自动化工具…");
        assert_eq!(title.chars().count(), 6);
    }
}
