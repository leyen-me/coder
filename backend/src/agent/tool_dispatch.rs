use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::types::AgentToolDefinition;
use crate::db::Database;
use crate::http::routes_settings::get_setting;
use crate::tools::{
    send_email, shell_kill, shell_list, shell_read_logs, tool_await, tool_browse_page,
    tool_edit_file, tool_get_workspace_tree, tool_glob, tool_grep, tool_list_dir,
    tool_plan_create, tool_plan_delete, tool_plan_edit, tool_plan_list, tool_plan_read,
    tool_plan_update, tool_read_file, tool_remote_shell, tool_replace_file,
    tool_replace_lines, tool_shell, tool_web_search, tool_write_file, PageCache,
    RemoteConnectionPool, ShellRegistry,
};

pub struct ToolExecutionContext<'a> {
    pub workspace_dir: Option<String>,
    pub session_id: Option<String>,
    pub task_id: Option<String>,
    pub agent_mode: Option<String>,
    pub allow_private_network_access: bool,
    pub db: Arc<Mutex<Database>>,
    pub shell_registry: Arc<Mutex<ShellRegistry>>,
    pub remote_pool: &'a RemoteConnectionPool,
    pub page_cache: &'a PageCache,
    pub broadcaster: Option<Arc<crate::SseBroadcaster>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResultEnvelope {
    pub ok: bool,
    pub tool: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ToolErrorPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolErrorPayload {
    pub code: String,
    pub message: String,
}

pub fn serialize_tool_result(result: &ToolResultEnvelope) -> String {
    serde_json::to_string(result).unwrap_or_else(|_| {
        json!({
            "ok": false,
            "tool": result.tool,
            "error": { "code": "serialization_failed", "message": "Failed to serialize tool result" }
        })
        .to_string()
    })
}

pub async fn execute_tool_call(
    name: &str,
    arguments: &str,
    ctx: &ToolExecutionContext<'_>,
) -> Result<ToolResultEnvelope, String> {
    let args = parse_args(arguments)?;
    match name {
        "read_file" => execute_read_file(args, ctx),
        "write_file" => execute_write_file(args, ctx),
        "replace_file" => execute_replace_file(args, ctx),
        "edit_file" => execute_edit_file(args, ctx),
        "replace_lines" => execute_replace_lines(args, ctx),
        "list_dir" => execute_list_dir(args, ctx),
        "glob" => execute_glob(args, ctx),
        "grep" => execute_grep(args, ctx),
        "shell" => execute_shell(args, ctx).await,
        "remote_shell" => execute_remote_shell(args, ctx).await,
        "await" => execute_await(args, ctx).await,
        "list_shells" => execute_list_shells(args, ctx),
        "kill_shell" => execute_kill_shell(args, ctx),
        "read_shell_logs" => execute_read_shell_logs(args, ctx),
        "web_search" => execute_web_search(args, ctx).await,
        "browse_page" => execute_browse_page(args, ctx).await,
        "get_workspace_tree" => execute_get_workspace_tree(args, ctx),
        "plan_create" => execute_plan_create(args, ctx),
        "plan_read" => execute_plan_read(args, ctx),
        "plan_update" => execute_plan_update(args, ctx),
        "plan_edit" => execute_plan_edit(args, ctx),
        "plan_delete" => execute_plan_delete(args, ctx),
        "plan_list" => execute_plan_list_args(args, ctx),
        "todo_read" => execute_todo_read(ctx),
        "todo_write" => execute_todo_write(args, ctx),
        "ask_question" => Ok(tool_failure(
            name,
            "interactive_not_supported",
            "ask_question is not yet supported by the backend agent runtime.",
        )),
        "spawn_subagent" => Ok(tool_failure(
            name,
            "not_supported",
            "spawn_subagent is not yet supported by the backend agent runtime.",
        )),
        "read_prior_tool_output" => Ok(tool_failure(
            name,
            "not_supported",
            "read_prior_tool_output is not yet supported by the backend agent runtime.",
        )),
        "send_email" => execute_send_email(args).await,
        _ => Ok(tool_failure(
            name,
            "unknown_tool",
            format!("Unknown tool: {name}"),
        )),
    }
}

pub fn all_tool_names() -> Vec<String> {
    [
        "read_file",
        "write_file",
        "replace_file",
        "edit_file",
        "replace_lines",
        "list_dir",
        "glob",
        "grep",
        "shell",
        "remote_shell",
        "await",
        "list_shells",
        "kill_shell",
        "read_shell_logs",
        "web_search",
        "browse_page",
        "get_workspace_tree",
        "plan_create",
        "plan_read",
        "plan_update",
        "plan_edit",
        "plan_delete",
        "plan_list",
        "todo_read",
        "todo_write",
        "ask_question",
        "spawn_subagent",
        "read_prior_tool_output",
        "send_email",
    ]
    .into_iter()
    .map(str::to_string)
    .collect()
}

pub fn get_tool_definitions(_agent_mode: Option<&str>) -> Vec<AgentToolDefinition> {
    Vec::new()
}

fn parse_args(arguments: &str) -> Result<Value, String> {
    let trimmed = arguments.trim();
    if trimmed.is_empty() {
        return Ok(Value::Object(Default::default()));
    }
    serde_json::from_str(trimmed).map_err(|error| format!("Tool arguments must be valid JSON: {error}"))
}

fn require_workspace_dir(ctx: &ToolExecutionContext<'_>, tool: &str) -> Result<String, ToolResultEnvelope> {
    ctx.workspace_dir.clone().ok_or_else(|| {
        tool_failure(
            tool,
            "workspace_required",
            "Select a workspace directory before using this tool.",
        )
    })
}

fn tool_success(tool: &str, data: impl Serialize) -> ToolResultEnvelope {
    match serde_json::to_value(data) {
        Ok(value) => ToolResultEnvelope {
            ok: true,
            tool: tool.to_string(),
            data: Some(value),
            error: None,
        },
        Err(error) => tool_failure(
            tool,
            "serialization_failed",
            format!("Failed to serialize tool result: {error}"),
        ),
    }
}

fn tool_failure(tool: &str, code: &str, message: impl Into<String>) -> ToolResultEnvelope {
    ToolResultEnvelope {
        ok: false,
        tool: tool.to_string(),
        data: None,
        error: Some(ToolErrorPayload {
            code: code.to_string(),
            message: message.into(),
        }),
    }
}

fn parse_from_value<T: for<'de> Deserialize<'de>>(tool: &str, value: Value) -> Result<T, ToolResultEnvelope> {
    serde_json::from_value(value).map_err(|error| {
        tool_failure(
            tool,
            "invalid_arguments",
            format!("Invalid arguments for {tool}: {error}"),
        )
    })
}

#[derive(Deserialize)]
struct ReadFileArgs {
    path: String,
    start_line: Option<u32>,
    max_lines: Option<u32>,
    respect_gitignore: Option<bool>,
}

fn execute_read_file(args: Value, ctx: &ToolExecutionContext<'_>) -> Result<ToolResultEnvelope, String> {
    let args: ReadFileArgs = match parse_from_value("read_file", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    let workspace_dir = match require_workspace_dir(ctx, "read_file") {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    Ok(match tool_read_file(
        workspace_dir,
        args.path,
        args.start_line,
        args.max_lines,
        args.respect_gitignore,
        Some(true),
    ) {
        Ok(result) => tool_success("read_file", result),
        Err(error) => tool_failure("read_file", "execution_failed", error.to_string()),
    })
}

#[derive(Deserialize)]
struct WriteFileArgs {
    path: String,
    content: String,
    create_parent_dirs: Option<bool>,
}

fn execute_write_file(args: Value, ctx: &ToolExecutionContext<'_>) -> Result<ToolResultEnvelope, String> {
    let args: WriteFileArgs = match parse_from_value("write_file", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    let workspace_dir = match require_workspace_dir(ctx, "write_file") {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    Ok(match tool_write_file(workspace_dir, args.path, args.content, args.create_parent_dirs) {
        Ok(result) => tool_success("write_file", result),
        Err(error) => tool_failure("write_file", "execution_failed", error.to_string()),
    })
}

#[derive(Deserialize)]
struct ReplaceFileArgs {
    path: String,
    content: String,
    expected_sha256: Option<String>,
    create_backup: Option<bool>,
    respect_gitignore: Option<bool>,
}

fn execute_replace_file(args: Value, ctx: &ToolExecutionContext<'_>) -> Result<ToolResultEnvelope, String> {
    let args: ReplaceFileArgs = match parse_from_value("replace_file", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    let workspace_dir = match require_workspace_dir(ctx, "replace_file") {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    Ok(match tool_replace_file(
        workspace_dir,
        args.path,
        args.content,
        args.expected_sha256,
        args.create_backup,
        args.respect_gitignore,
    ) {
        Ok(result) => tool_success("replace_file", result),
        Err(error) => tool_failure("replace_file", "execution_failed", error.to_string()),
    })
}

#[derive(Deserialize)]
struct EditFileArgs {
    path: String,
    old_string: String,
    new_string: String,
    expected_sha256: Option<String>,
    replace_all: Option<bool>,
    create_backup: Option<bool>,
    respect_gitignore: Option<bool>,
}

fn execute_edit_file(args: Value, ctx: &ToolExecutionContext<'_>) -> Result<ToolResultEnvelope, String> {
    let args: EditFileArgs = match parse_from_value("edit_file", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    let workspace_dir = match require_workspace_dir(ctx, "edit_file") {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    Ok(match tool_edit_file(
        workspace_dir,
        args.path,
        args.old_string,
        args.new_string,
        args.expected_sha256,
        args.replace_all,
        args.create_backup,
        args.respect_gitignore,
    ) {
        Ok(result) => tool_success("edit_file", result),
        Err(error) => tool_failure("edit_file", "execution_failed", error.to_string()),
    })
}

#[derive(Deserialize)]
struct ReplaceLinesArgs {
    path: String,
    start_line: u32,
    end_line: u32,
    content: String,
    expected_sha256: Option<String>,
    create_backup: Option<bool>,
    respect_gitignore: Option<bool>,
}

fn execute_replace_lines(args: Value, ctx: &ToolExecutionContext<'_>) -> Result<ToolResultEnvelope, String> {
    let args: ReplaceLinesArgs = match parse_from_value("replace_lines", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    let workspace_dir = match require_workspace_dir(ctx, "replace_lines") {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    Ok(match tool_replace_lines(
        workspace_dir,
        args.path,
        args.start_line,
        args.end_line,
        args.content,
        args.expected_sha256,
        args.create_backup,
        args.respect_gitignore,
    ) {
        Ok(result) => tool_success("replace_lines", result),
        Err(error) => tool_failure("replace_lines", "execution_failed", error.to_string()),
    })
}

#[derive(Deserialize)]
struct ListDirArgs {
    path: String,
    recursive: Option<bool>,
    max_depth: Option<u32>,
    show_hidden: Option<bool>,
}

fn execute_list_dir(args: Value, ctx: &ToolExecutionContext<'_>) -> Result<ToolResultEnvelope, String> {
    let args: ListDirArgs = match parse_from_value("list_dir", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    let workspace_dir = match require_workspace_dir(ctx, "list_dir") {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    Ok(match tool_list_dir(
        workspace_dir,
        args.path,
        args.recursive,
        args.max_depth,
        args.show_hidden,
    ) {
        Ok(result) => tool_success("list_dir", result),
        Err(error) => tool_failure("list_dir", "execution_failed", error),
    })
}

#[derive(Deserialize)]
struct GlobArgs {
    glob_pattern: String,
    target_directory: Option<String>,
    head_limit: Option<u32>,
    respect_gitignore: Option<bool>,
}

fn execute_glob(args: Value, ctx: &ToolExecutionContext<'_>) -> Result<ToolResultEnvelope, String> {
    let args: GlobArgs = match parse_from_value("glob", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    let workspace_dir = match require_workspace_dir(ctx, "glob") {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    Ok(match tool_glob(
        workspace_dir,
        args.glob_pattern,
        args.target_directory,
        args.head_limit,
        args.respect_gitignore,
    ) {
        Ok(result) => tool_success("glob", result),
        Err(error) => tool_failure("glob", "execution_failed", error.to_string()),
    })
}

#[derive(Deserialize)]
struct GrepArgs {
    pattern: String,
    path: Option<String>,
    glob: Option<String>,
    output_mode: Option<String>,
    case_insensitive: Option<bool>,
    context_before: Option<u32>,
    context_after: Option<u32>,
    context: Option<u32>,
    head_limit: Option<u32>,
    offset: Option<u32>,
    multiline: Option<bool>,
    respect_gitignore: Option<bool>,
}

fn execute_grep(args: Value, ctx: &ToolExecutionContext<'_>) -> Result<ToolResultEnvelope, String> {
    let args: GrepArgs = match parse_from_value("grep", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    let workspace_dir = match require_workspace_dir(ctx, "grep") {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    Ok(match tool_grep(
        workspace_dir,
        args.pattern,
        args.path,
        args.glob,
        args.output_mode,
        args.case_insensitive,
        args.context_before,
        args.context_after,
        args.context,
        args.head_limit,
        args.offset,
        args.multiline,
        args.respect_gitignore,
    ) {
        Ok(result) => tool_success("grep", result),
        Err(error) => tool_failure("grep", "execution_failed", error.to_string()),
    })
}

#[derive(Deserialize)]
struct ShellArgs {
    command: String,
    description: Option<String>,
    working_directory: Option<String>,
    block_until_ms: Option<u64>,
}

async fn execute_shell(args: Value, ctx: &ToolExecutionContext<'_>) -> Result<ToolResultEnvelope, String> {
    let args: ShellArgs = match parse_from_value("shell", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    let workspace_dir = match require_workspace_dir(ctx, "shell") {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    Ok(match tool_shell(
        ctx.shell_registry.clone(),
        ctx.broadcaster.clone(),
        workspace_dir,
        args.command,
        args.description,
        args.working_directory,
        args.block_until_ms,
        ctx.task_id.clone(),
    )
    .await
    {
        Ok(result) => tool_success("shell", result),
        Err(error) => tool_failure("shell", "execution_failed", error),
    })
}

#[derive(Deserialize)]
struct RemoteShellArgs {
    target: String,
    command: String,
    description: Option<String>,
    block_until_ms: Option<u64>,
}

async fn execute_remote_shell(
    args: Value,
    ctx: &ToolExecutionContext<'_>,
) -> Result<ToolResultEnvelope, String> {
    let args: RemoteShellArgs = match parse_from_value("remote_shell", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    let target = match load_remote_target(ctx, &args.target) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    Ok(match tool_remote_shell(
        ctx.shell_registry.clone(),
        ctx.remote_pool,
        ctx.broadcaster.clone(),
        args.command,
        args.description,
        target,
        args.block_until_ms,
        ctx.task_id.clone(),
    )
    .await
    {
        Ok(result) => tool_success("remote_shell", result),
        Err(error) => tool_failure("remote_shell", "execution_failed", error),
    })
}

#[derive(Deserialize)]
struct AwaitArgs {
    shell_id: String,
    block_until_ms: Option<u64>,
}

async fn execute_await(args: Value, ctx: &ToolExecutionContext<'_>) -> Result<ToolResultEnvelope, String> {
    let args: AwaitArgs = match parse_from_value("await", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    Ok(match tool_await(ctx.shell_registry.clone(), args.shell_id, args.block_until_ms).await {
        Ok(result) => tool_success("await", result),
        Err(error) => tool_failure("await", "execution_failed", error),
    })
}

#[derive(Deserialize)]
struct ListShellsArgs {
    status_filter: Option<String>,
    task_id_filter: Option<String>,
}

fn execute_list_shells(args: Value, ctx: &ToolExecutionContext<'_>) -> Result<ToolResultEnvelope, String> {
    let args: ListShellsArgs = match parse_from_value("list_shells", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    let filter = match args.status_filter.as_deref() {
        Some("all") => None,
        Some("running") | None => Some(crate::tools::shell::ShellStatusFilter::Running),
        Some("completed") => Some(crate::tools::shell::ShellStatusFilter::Completed),
        Some("failed") => Some(crate::tools::shell::ShellStatusFilter::Failed),
        Some("timeout") => Some(crate::tools::shell::ShellStatusFilter::Timeout),
        Some("cancelled") => Some(crate::tools::shell::ShellStatusFilter::Cancelled),
        Some(other) => {
            return Ok(tool_failure(
                "list_shells",
                "invalid_arguments",
                format!("Unknown status_filter: {other}"),
            ))
        }
    };
    Ok(match shell_list(&ctx.shell_registry, filter) {
        Ok(mut result) => {
            if let Some(task_id_filter) = args.task_id_filter {
                result.retain(|shell| shell.task_id.as_deref() == Some(task_id_filter.as_str()));
            }
            tool_success("list_shells", result)
        }
        Err(error) => tool_failure("list_shells", "execution_failed", error),
    })
}

#[derive(Deserialize)]
struct KillShellArgs {
    shell_id: String,
}

fn execute_kill_shell(args: Value, ctx: &ToolExecutionContext<'_>) -> Result<ToolResultEnvelope, String> {
    let args: KillShellArgs = match parse_from_value("kill_shell", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    Ok(match shell_kill(&ctx.shell_registry, args.shell_id) {
        Ok(()) => tool_success("kill_shell", json!({ "ok": true })),
        Err(error) => tool_failure("kill_shell", "execution_failed", error),
    })
}

#[derive(Deserialize)]
struct ReadShellLogsArgs {
    shell_id: String,
    stream: Option<String>,
    offset: Option<usize>,
    limit: Option<usize>,
}

fn execute_read_shell_logs(
    args: Value,
    ctx: &ToolExecutionContext<'_>,
) -> Result<ToolResultEnvelope, String> {
    let args: ReadShellLogsArgs = match parse_from_value("read_shell_logs", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    Ok(match shell_read_logs(
        &ctx.shell_registry,
        args.shell_id,
        args.stream,
        args.offset,
        args.limit,
    ) {
        Ok(result) => tool_success("read_shell_logs", result),
        Err(error) => tool_failure("read_shell_logs", "execution_failed", error),
    })
}

#[derive(Deserialize)]
struct WebSearchArgs {
    search_term: String,
    max_results: Option<u8>,
}

async fn execute_web_search(args: Value, ctx: &ToolExecutionContext<'_>) -> Result<ToolResultEnvelope, String> {
    let args: WebSearchArgs = match parse_from_value("web_search", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    let provider = get_setting("webSearchProvider");
    let tavily_api_key_source = get_setting("tavilyApiKeySource").or_else(|| Some("manual".to_string()));
    let tavily_api_key = get_setting("tavilyApiKey");
    let tavily_api_key_env_var = get_setting("tavilyApiKeyEnvVar").or_else(|| Some("TAVILY_API_KEY".to_string()));
    let searxng_base_url = get_setting("searxngBaseUrl");

    Ok(match tool_web_search(
        args.search_term,
        provider,
        tavily_api_key_source,
        tavily_api_key,
        tavily_api_key_env_var,
        searxng_base_url,
        Some(ctx.allow_private_network_access),
        args.max_results,
    )
    .await
    {
        Ok(result) => tool_success("web_search", result),
        Err(error) => tool_failure("web_search", error.code.as_str(), error.message),
    })
}

#[derive(Deserialize)]
struct BrowsePageArgs {
    url: String,
    start_line: Option<u32>,
    max_lines: Option<u32>,
}

async fn execute_browse_page(
    args: Value,
    ctx: &ToolExecutionContext<'_>,
) -> Result<ToolResultEnvelope, String> {
    let args: BrowsePageArgs = match parse_from_value("browse_page", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    Ok(match tool_browse_page(
        ctx.page_cache,
        args.url,
        args.start_line,
        args.max_lines,
        Some(ctx.allow_private_network_access),
    )
    .await
    {
        Ok(result) => tool_success("browse_page", result),
        Err(error) => tool_failure("browse_page", error.code.as_str(), error.message),
    })
}

#[derive(Deserialize)]
struct WorkspaceTreeArgs {
    start_line: Option<u32>,
    max_lines: Option<u32>,
}

fn execute_get_workspace_tree(
    args: Value,
    ctx: &ToolExecutionContext<'_>,
) -> Result<ToolResultEnvelope, String> {
    let args: WorkspaceTreeArgs = match parse_from_value("get_workspace_tree", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    let workspace_dir = match require_workspace_dir(ctx, "get_workspace_tree") {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    Ok(match tool_get_workspace_tree(workspace_dir, args.start_line, args.max_lines) {
        Ok(result) => tool_success("get_workspace_tree", result),
        Err(error) => tool_failure("get_workspace_tree", "execution_failed", error.to_string()),
    })
}

#[derive(Deserialize)]
struct PlanContentArgs {
    name: String,
    content: String,
}

#[derive(Deserialize)]
struct PlanNameArgs {
    name: String,
}

#[derive(Deserialize)]
struct PlanEditArgs {
    name: String,
    old_string: String,
    new_string: String,
    replace_all: Option<bool>,
}

fn execute_plan_create(args: Value, ctx: &ToolExecutionContext<'_>) -> Result<ToolResultEnvelope, String> {
    let args: PlanContentArgs = match parse_from_value("plan_create", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    let workspace_dir = match require_workspace_dir(ctx, "plan_create") {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    Ok(match tool_plan_create(workspace_dir, args.name, args.content) {
        Ok(result) => tool_success("plan_create", result),
        Err(error) => tool_failure("plan_create", "execution_failed", error.to_string()),
    })
}

fn execute_plan_read(args: Value, ctx: &ToolExecutionContext<'_>) -> Result<ToolResultEnvelope, String> {
    let args: PlanNameArgs = match parse_from_value("plan_read", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    let workspace_dir = match require_workspace_dir(ctx, "plan_read") {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    Ok(match tool_plan_read(workspace_dir, args.name) {
        Ok(result) => tool_success("plan_read", result),
        Err(error) => tool_failure("plan_read", "execution_failed", error.to_string()),
    })
}

fn execute_plan_update(args: Value, ctx: &ToolExecutionContext<'_>) -> Result<ToolResultEnvelope, String> {
    let args: PlanContentArgs = match parse_from_value("plan_update", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    let workspace_dir = match require_workspace_dir(ctx, "plan_update") {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    Ok(match tool_plan_update(workspace_dir, args.name, args.content) {
        Ok(result) => tool_success("plan_update", result),
        Err(error) => tool_failure("plan_update", "execution_failed", error.to_string()),
    })
}

fn execute_plan_edit(args: Value, ctx: &ToolExecutionContext<'_>) -> Result<ToolResultEnvelope, String> {
    let args: PlanEditArgs = match parse_from_value("plan_edit", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    let workspace_dir = match require_workspace_dir(ctx, "plan_edit") {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    Ok(match tool_plan_edit(
        workspace_dir,
        args.name,
        args.old_string,
        args.new_string,
        args.replace_all,
    ) {
        Ok(result) => tool_success("plan_edit", result),
        Err(error) => tool_failure("plan_edit", "execution_failed", error.to_string()),
    })
}

fn execute_plan_delete(args: Value, ctx: &ToolExecutionContext<'_>) -> Result<ToolResultEnvelope, String> {
    let args: PlanNameArgs = match parse_from_value("plan_delete", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    let workspace_dir = match require_workspace_dir(ctx, "plan_delete") {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    Ok(match tool_plan_delete(workspace_dir, args.name) {
        Ok(result) => tool_success("plan_delete", result),
        Err(error) => tool_failure("plan_delete", "execution_failed", error.to_string()),
    })
}

fn execute_plan_list(ctx: &ToolExecutionContext<'_>) -> Result<ToolResultEnvelope, String> {
    let workspace_dir = match require_workspace_dir(ctx, "plan_list") {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    Ok(match tool_plan_list(workspace_dir) {
        Ok(result) => tool_success("plan_list", result),
        Err(error) => tool_failure("plan_list", "execution_failed", error.to_string()),
    })
}

fn execute_plan_list_args(
    _args: Value,
    ctx: &ToolExecutionContext<'_>,
) -> Result<ToolResultEnvelope, String> {
    execute_plan_list(ctx)
}

fn execute_todo_read(ctx: &ToolExecutionContext<'_>) -> Result<ToolResultEnvelope, String> {
    let session_id = match ctx.session_id.clone() {
        Some(value) if !value.trim().is_empty() => value,
        _ => {
            return Ok(tool_failure(
                "todo_read",
                "missing_session",
                "Todo reads require an active session.",
            ))
        }
    };
    let db = match ctx.db.lock() {
        Ok(db) => db,
        Err(_) => return Ok(tool_failure("todo_read", "execution_failed", "Database lock poisoned.")),
    };
    let values = match db.get_all_from_index::<Value>("agentTodos", "by-sessionId", Some(session_id.as_str())) {
        Ok(values) => values,
        Err(error) => return Ok(tool_failure("todo_read", "execution_failed", error)),
    };
    let mut todos = values;
    todos.sort_by_key(|value| {
        value
            .get("order")
            .and_then(Value::as_i64)
            .unwrap_or_default()
    });
    Ok(tool_success("todo_read", json!({ "sessionId": session_id, "todos": todos })))
}

#[derive(Deserialize)]
struct TodoWriteArgs {
    merge: bool,
    todos: Vec<Value>,
    remove_ids: Option<Vec<String>>,
}

fn execute_todo_write(args: Value, ctx: &ToolExecutionContext<'_>) -> Result<ToolResultEnvelope, String> {
    let args: TodoWriteArgs = match parse_from_value("todo_write", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    let session_id = match ctx.session_id.clone() {
        Some(value) if !value.trim().is_empty() => value,
        _ => {
            return Ok(tool_failure(
                "todo_write",
                "missing_session",
                "Todo writes require an active session.",
            ))
        }
    };
    let db = match ctx.db.lock() {
        Ok(db) => db,
        Err(_) => return Ok(tool_failure("todo_write", "execution_failed", "Database lock poisoned.")),
    };
    let existing = match db.get_all_from_index::<Value>("agentTodos", "by-sessionId", Some(session_id.as_str())) {
        Ok(values) => values,
        Err(error) => return Ok(tool_failure("todo_write", "execution_failed", error)),
    };
    let now = current_timestamp_ms();
    let remove_ids = args.remove_ids.unwrap_or_default();

    let mut merged = if args.merge { existing } else { Vec::new() };
    merged.retain(|value| {
        !remove_ids.iter().any(|id| value.get("id").and_then(Value::as_str) == Some(id.as_str()))
    });
    for (index, todo) in args.todos.into_iter().enumerate() {
        let Some(id) = todo.get("id").and_then(Value::as_str).map(str::to_string) else {
            return Ok(tool_failure(
                "todo_write",
                "invalid_arguments",
                "todos[].id is required.",
            ));
        };
        let status = todo
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or("pending");
        let content = todo
            .get("content")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        let created_at = merged
            .iter()
            .find(|value| value.get("id").and_then(Value::as_str) == Some(id.as_str()))
            .and_then(|value| value.get("createdAt").and_then(Value::as_u64))
            .unwrap_or(now);
        let next = json!({
            "id": id,
            "sessionId": session_id,
            "content": content,
            "status": status,
            "order": index,
            "createdAt": created_at,
            "updatedAt": now,
        });
        if let Some(position) = merged
            .iter()
            .position(|value| value.get("id").and_then(Value::as_str) == next.get("id").and_then(Value::as_str))
        {
            merged[position] = next;
        } else {
            merged.push(next);
        }
    }

    for value in &merged {
        let Some(id) = value.get("id").and_then(Value::as_str) else {
            continue;
        };
        let indexes = vec![
            crate::db::IndexEntry {
                name: "by-sessionId".to_string(),
                value: session_id.clone(),
            },
            crate::db::IndexEntry {
                name: "by-sessionId-order".to_string(),
                value: session_id.clone(),
            },
        ];
        if let Err(error) = db.put("agentTodos", id, value, &indexes) {
            return Ok(tool_failure("todo_write", "execution_failed", error));
        }
    }

    let existing_ids: Vec<String> = match db.get_all_from_index::<Value>("agentTodos", "by-sessionId", Some(session_id.as_str())) {
        Ok(values) => values
            .into_iter()
            .filter_map(|value| value.get("id").and_then(Value::as_str).map(str::to_string))
            .collect(),
        Err(error) => return Ok(tool_failure("todo_write", "execution_failed", error)),
    };
    for id in existing_ids {
        if !merged.iter().any(|value| value.get("id").and_then(Value::as_str) == Some(id.as_str())) {
            let _ = db.delete("agentTodos", &id);
        }
    }

    Ok(tool_success(
        "todo_write",
        json!({ "sessionId": session_id, "todos": merged, "merge": args.merge }),
    ))
}

async fn execute_send_email(args: Value) -> Result<ToolResultEnvelope, String> {
    #[derive(Deserialize)]
    struct SendEmailArgs {
        to: String,
        subject: String,
        body: String,
    }
    let args: SendEmailArgs = match parse_from_value("send_email", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    let settings_json = match get_setting("emailSettings") {
        Some(value) => value,
        None => {
            return Ok(tool_failure(
                "send_email",
                "missing_settings",
                "Email settings are not configured.",
            ))
        }
    };
    let settings: crate::tools::mail::EmailSettings = match serde_json::from_str(&settings_json) {
        Ok(value) => value,
        Err(error) => {
            return Ok(tool_failure(
                "send_email",
                "invalid_settings",
                format!("Invalid email settings: {error}"),
            ))
        }
    };
    match send_email(crate::tools::mail::SendEmailRequest {
        settings,
        to: args.to,
        subject: args.subject,
        body: args.body,
    })
    .await
    {
        Ok(message) => Ok(tool_success("send_email", json!({ "message": message }))),
        Err(error) => Ok(tool_failure("send_email", "execution_failed", error)),
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteTargetRecord {
    alias: String,
    host: String,
    port: u16,
    user: String,
    auth: crate::tools::remote_connection::RemoteTargetAuth,
}

fn load_remote_target(
    ctx: &ToolExecutionContext<'_>,
    alias: &str,
) -> Result<crate::tools::remote_connection::RemoteTargetConfig, ToolResultEnvelope> {
    let db = ctx
        .db
        .lock()
        .map_err(|_| tool_failure("remote_shell", "execution_failed", "Database lock poisoned."))?;
    let value = db
        .get::<Value>("remoteTargets", alias)
        .map_err(|error| tool_failure("remote_shell", "execution_failed", error))?
        .ok_or_else(|| {
            tool_failure(
                "remote_shell",
                "unknown_target",
                format!("Unknown remote target: {alias}"),
            )
        })?;
    let record: RemoteTargetRecord = serde_json::from_value(value).map_err(|error| {
        tool_failure(
            "remote_shell",
            "invalid_target",
            format!("Invalid remote target config: {error}"),
        )
    })?;
    Ok(crate::tools::remote_connection::RemoteTargetConfig {
        alias: record.alias,
        host: record.host,
        port: record.port,
        user: record.user,
        auth: record.auth,
    })
}

fn current_timestamp_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
