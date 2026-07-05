use axum::{extract::State, http::StatusCode, Json};
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;

use crate::agent;
use crate::tools::*;
use crate::AppState;

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
    pub respect_gitignore: Option<bool>,
    pub numbered: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteFileParams {
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
pub struct GlobParams {
    pub workspace_dir: Option<String>,
    pub glob_pattern: String,
    pub target_directory: Option<String>,
    pub head_limit: Option<u32>,
    pub respect_gitignore: Option<bool>,
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
    pub api_key_source: Option<String>,
    pub api_key: Option<String>,
    pub api_key_env_var: Option<String>,
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
    pub messages: Vec<agent::ChatMessage>,
    pub tools: Option<Vec<agent::AgentToolDefinition>>,
    pub request_extensions: Option<Value>,
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
        params.respect_gitignore,
        params.numbered,
    )
    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/write_file
pub async fn handle_write_file(
    State(state): State<Arc<AppState>>,
    Json(params): Json<WriteFileParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let workspace_dir = resolve_workspace_dir(params.workspace_dir, &state.workspace_dir);
    let result = tool_write_file(workspace_dir, params.path, params.content, params.create_parent_dirs)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
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
        params.api_key_source.unwrap_or_else(|| "manual".to_string()),
        params.api_key,
        params.api_key_env_var,
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
    let agent_params = agent::AgentStartParams {
        task_id: params.task_id,
        base_url: params.base_url,
        api_key: params.api_key,
        api_key_source: params.api_key_source.unwrap_or_else(|| "manual".to_string()),
        api_key_env_var: params.api_key_env_var.unwrap_or_else(|| "OPENAI_API_KEY".to_string()),
        model: params.model,
        messages: params.messages,
        tools: params.tools,
        request_extensions: params.request_extensions,
    };
    agent::agent_start(
        &state.agent_registry,
        agent_params,
        state.sse_broadcaster.clone(),
    )
    .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::to_value(serde_json::json!({"ok": true})).map_err(
        |e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    )?))
}

/// POST /agent/cancel
pub async fn handle_agent_cancel(
    State(state): State<Arc<AppState>>,
    Json(params): Json<AgentCancelParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    agent::agent_cancel(&state.agent_registry, params.task_id.clone())
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    let _ = shell_kill_by_task(&state.shell_registry, params.task_id);
    Ok(Json(serde_json::to_value(serde_json::json!({"ok": true})).map_err(
        |e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    )?))
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildSystemPromptParams {
    pub workspace_dir: Option<String>,
    pub agent_mode: String,
    pub session_kind: Option<String>,
    pub autonomy_mode: Option<String>,
    pub decision_policy_version: Option<String>,
    pub decision_model: Option<String>,
    pub extra_communication_rules: Option<Vec<String>>,
}

/// POST /agent/build_system_prompt
pub async fn handle_build_system_prompt(
    State(state): State<Arc<AppState>>,
    Json(params): Json<BuildSystemPromptParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    use crate::agent::prompt::{
        build_system_prompt, load_prompt_context, AgentPromptMode, BuildSystemPromptInput,
        SessionPolicyInput,
    };

    let workspace_dir = params.workspace_dir.and_then(|dir| {
        let trimmed = dir.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    });

    let agent_mode = match params.agent_mode.as_str() {
        "ask" => AgentPromptMode::Ask,
        "plan" => AgentPromptMode::Plan,
        _ => AgentPromptMode::Agent,
    };

    let session_policy = match (params.session_kind, params.autonomy_mode) {
        (Some(session_kind), Some(autonomy_mode)) => Some(SessionPolicyInput {
            session_kind,
            autonomy_mode,
            decision_policy_version: params
                .decision_policy_version
                .unwrap_or_else(|| "mvp-v1".to_string()),
            decision_model: params.decision_model,
        }),
        _ => None,
    };

    let prompt_context = load_prompt_context(&state.db)
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error))?;

    let system_prompt = build_system_prompt(BuildSystemPromptInput {
        workspace_dir,
        agent_mode,
        extra_communication_rules: params.extra_communication_rules.unwrap_or_default(),
        session_policy,
        prompt_context,
    })
    .map_err(|error| (StatusCode::BAD_REQUEST, error))?;

    Ok(Json(serde_json::json!({ "systemPrompt": system_prompt })))
}

// ---------------------------------------------------------------------------
// Plan handlers
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanNameParams {
    pub workspace_dir: String,
    pub name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanContentParams {
    pub workspace_dir: String,
    pub name: String,
    pub content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanEditParams {
    pub workspace_dir: String,
    pub name: String,
    pub old_string: String,
    pub new_string: String,
    pub replace_all: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanListParams {
    pub workspace_dir: String,
}

/// POST /api/tool_plan_create
pub async fn handle_plan_create(
    Json(params): Json<PlanContentParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let result = tool_plan_create(params.workspace_dir, params.name, params.content)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/tool_plan_read
pub async fn handle_plan_read(
    Json(params): Json<PlanNameParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let result = tool_plan_read(params.workspace_dir, params.name)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/tool_plan_update
pub async fn handle_plan_update(
    Json(params): Json<PlanContentParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let result = tool_plan_update(params.workspace_dir, params.name, params.content)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/tool_plan_edit
pub async fn handle_plan_edit(
    Json(params): Json<PlanEditParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let result = tool_plan_edit(
        params.workspace_dir,
        params.name,
        params.old_string,
        params.new_string,
        params.replace_all,
    )
    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/tool_plan_delete
pub async fn handle_plan_delete(
    Json(params): Json<PlanNameParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let result = tool_plan_delete(params.workspace_dir, params.name)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}

/// POST /api/tool_plan_list
pub async fn handle_plan_list(
    Json(params): Json<PlanListParams>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let result = tool_plan_list(params.workspace_dir)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?))
}
