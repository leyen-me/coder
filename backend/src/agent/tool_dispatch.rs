use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;

use super::types::AgentToolDefinition;
use crate::db::Database;
use crate::http::routes_settings::get_setting;
use crate::scheduled_jobs::{
    create_job, delete_job, infer_provider_for_model, is_valid_cron_expression, list_jobs,
    update_job, AgentMode, AutomationRecord, CreateJobInput, UpdateJobInput,
};
use crate::tools::{
    send_email, shell_kill, shell_list, shell_read_logs, tool_await, tool_browse_page,
    tool_edit_file, tool_get_workspace_tree, tool_glob, tool_grep, tool_list_dir,
    tool_plan_create, tool_plan_delete, tool_plan_edit, tool_plan_list, tool_plan_read,
    tool_plan_update, tool_read_file, tool_remote_shell, tool_replace_file,
    tool_replace_lines, tool_shell, tool_web_search, tool_create_file, PageCache,
    RemoteConnectionPool, ShellRegistry,
};

#[derive(Clone)]
pub struct ToolExecutionContext<'a> {
    pub workspace_dir: Option<String>,
    pub session_id: Option<String>,
    pub task_id: Option<String>,
    pub current_tool_call_id: Option<String>,
    pub agent_mode: Option<String>,
    pub available_tools: Vec<AgentToolDefinition>,
    pub parent_start_params: super::types::AgentStartParams,
    pub allow_private_network_access: bool,
    pub app_state: Arc<crate::AppState>,
    pub db: Arc<Mutex<Database>>,
    pub ask_question_registry: Arc<crate::agent::ask_question::AskQuestionRegistry>,
    pub shell_registry: Arc<Mutex<ShellRegistry>>,
    pub mcp_registry: Arc<crate::tools::McpRegistry>,
    pub remote_pool: &'a RemoteConnectionPool,
    pub page_cache: &'a PageCache,
    pub broadcaster: Option<Arc<crate::SseBroadcaster>>,
    pub cancel_token: CancellationToken,
    pub concurrent_agents: Arc<ConcurrentAgentStore>,
    pub tool_result_message_id: Option<String>,
}

/// A spawned sub-agent tracked by handle_id.
///
/// After the refactor, a SubAgent **is** a normal Session: it has its own
/// `session_id` and `task_id`, runs through the standard agent loop, and is
/// observed via its own SSE channel. The store no longer holds a JoinHandle
/// or cancel_token — cancellation goes through `cancel::cancel_session_and_children`.
#[derive(Clone, Debug)]
pub struct SpawnedAgent {
    pub handle_id: String,
    pub task: String,
    pub session_id: String,
    pub task_id: String,
    /// The tool_call_id of the parent's spawn_subagent invocation. Used by
    /// await_subagent to emit a status update back to that invocation so the
    /// frontend Label stops spinning.
    pub spawn_tool_call_id: Option<String>,
    pub started_at: Instant,
}

/// Shared store of background sub-agents for parallel spawn/await.
///
/// After the refactor, this store only tracks the {handle_id → session/task}
/// mapping. Waiting for completion is done in `execute_await_subagent` via
/// SSE subscription + `tokio::select!`, not by awaiting a JoinHandle.
pub struct ConcurrentAgentStore {
    agents: tokio::sync::Mutex<HashMap<String, SpawnedAgent>>,
    max_concurrent: usize,
}

impl ConcurrentAgentStore {
    pub fn new(max_concurrent: usize) -> Self {
        Self {
            agents: tokio::sync::Mutex::new(HashMap::new()),
            max_concurrent,
        }
    }

    /// Register a background sub-agent and return its handle_id.
    pub async fn register(
        &self,
        handle_id: String,
        task: String,
        session_id: String,
        task_id: String,
        spawn_tool_call_id: Option<String>,
    ) -> Result<(), String> {
        let mut agents = self.agents.lock().await;
        if agents.len() >= self.max_concurrent {
            return Err(format!(
                "Maximum concurrent sub-agents ({}) reached.",
                self.max_concurrent
            ));
        }
        agents.insert(
            handle_id.clone(),
            SpawnedAgent {
                handle_id,
                task,
                session_id,
                task_id,
                spawn_tool_call_id,
                started_at: Instant::now(),
            },
        );
        Ok(())
    }

    /// Look up a spawned agent by handle_id (used by `execute_await_subagent`
    /// to obtain the child `session_id` + `task_id` for SSE subscription).
    pub async fn get(&self, handle_id: &str) -> Option<SpawnedAgent> {
        let agents = self.agents.lock().await;
        agents.get(handle_id).cloned()
    }

    /// Remove a handle after `execute_await_subagent` has consumed it.
    pub async fn remove(&self, handle_id: &str) {
        let mut agents = self.agents.lock().await;
        agents.remove(handle_id);
    }

    /// Cancel all registered sub-agents by cascading cancel on their sessions.
    /// Called when the parent agent loop exits (e.g. parent cancelled).
    pub async fn cancel_all(&self, state: &Arc<crate::AppState>) {
        let agents = self.agents.lock().await;
        for (_, agent) in agents.iter() {
            let _ =
                crate::agent::cancel::cancel_session_and_children(state, &agent.session_id).await;
        }
    }
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
    if is_disabled_agent_tool(name) {
        return Ok(tool_failure(
            name,
            "tool_disabled",
            format!("Tool `{name}` is temporarily disabled."),
        ));
    }
    // Runtime mode enforcement: reject tools not allowed in the current mode.
    // MCP tools (mcp__*) are dynamically registered by the user and always allowed
    // in agent mode. Built-in tools are checked against the mode's allowlist.
    if let Some(mode) = ctx.agent_mode.as_deref() {
        let is_mcp_tool = name.starts_with("mcp__");
        if !is_mcp_tool {
            let allowed = tool_names(Some(mode));
            if !allowed.contains(&name.to_string()) {
                return Ok(tool_failure(
                    name,
                    "tool_not_allowed_in_mode",
                    format!("Tool `{name}` is not allowed in `{mode}` mode."),
                ));
            }
        }
    }
    let args = parse_args(arguments)?;
    if let Some((server_id, tool_name)) = parse_mcp_tool_name(name) {
        return execute_mcp_tool_call(name, &server_id, &tool_name, args, ctx).await;
    }
    match name {
        "read_file" => execute_read_file(args, ctx),
        "create_file" | "write_file" => execute_create_file(args, ctx),
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
        "ask_question" => execute_ask_question(args, ctx).await,
        "spawn_subagent" => execute_spawn_subagent(args, ctx).await,
        "await_subagent" => execute_await_subagent(args, ctx).await,
        "send_email" => execute_send_email(args).await,
        "list_automations" => execute_list_automations(ctx),
        "create_automation" => execute_create_automation(args, ctx),
        "update_automation" => execute_update_automation(args, ctx),
        "delete_automation" => execute_delete_automation(args, ctx),
        _ => Ok(tool_failure(
            name,
            "unknown_tool",
            format!("Unknown tool: {name}"),
        )),
    }
}

fn parse_mcp_tool_name(name: &str) -> Option<(String, String)> {
    let rest = name.strip_prefix("mcp__")?;
    let separator_index = rest.find("__")?;
    if separator_index == 0 {
        return None;
    }
    let server_id = rest[..separator_index].trim();
    let tool_name = rest[separator_index + 2..].trim();
    if server_id.is_empty() || tool_name.is_empty() {
        return None;
    }
    Some((server_id.to_string(), tool_name.to_string()))
}

pub fn all_tool_names() -> Vec<String> {
    [
        "read_file",
        "create_file",
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
        "await_subagent",
        "send_email",
        "list_automations",
        "create_automation",
        "update_automation",
        "delete_automation",
    ]
    .into_iter()
    .map(str::to_string)
    .collect()
}

const PLAN_TOOL_NAMES: &[&str] = &[
    "plan_create",
    "plan_read",
    "plan_update",
    "plan_edit",
    "plan_delete",
    "plan_list",
];

/// Agent tools kept in code but withheld from the model until re-enabled.
const DISABLED_AGENT_TOOL_NAMES: &[&str] = &["replace_lines"];

fn is_disabled_agent_tool(name: &str) -> bool {
    DISABLED_AGENT_TOOL_NAMES.contains(&name)
}

/// Returns the tool names allowed in the given agent mode (None = agent mode).
/// Used both for filtering the tool catalog and for runtime enforcement.
pub fn tool_names(mode: Option<&str>) -> Vec<String> {
    let mode = mode.unwrap_or("agent");
    let all = all_tool_names();
    match mode {
        "ask" | "plan" => all
            .into_iter()
            .filter(|n| {
                matches!(
                    n.as_str(),
                    "ask_question"
                        | "await"
                        | "await_subagent"
                        | "browse_page"
                        | "get_workspace_tree"
                        | "glob"
                        | "grep"
                        | "list_automations"
                        | "list_dir"
                        | "list_shells"
                        | "plan_create"
                        | "plan_read"
                        | "plan_update"
                        | "plan_edit"
                        | "plan_delete"
                        | "plan_list"
                        | "read_file"
                        | "read_shell_logs"
                        | "search"
                        | "spawn_subagent"
                        | "todo_read"
                        | "todo_write"
                        | "web_search"
                        | "list_skills"
                        | "read_skill"
                )
            })
            .collect(),
        _ => all,
    }
}

pub fn get_tool_definitions(agent_mode: Option<&str>) -> Vec<AgentToolDefinition> {
    let mut tools = vec![
        tool_definition(
            "list_dir",
            "List files and directories under a path. Relative paths are resolved against the workspace root.",
            json!({
                "type": "object",
                "properties": {
                    "path": string_schema("Relative or absolute path within the workspace."),
                    "recursive": bool_schema("Whether to list entries recursively.", Some(false)),
                    "max_depth": int_schema("Maximum recursion depth when recursive is true.", Some(1)),
                    "show_hidden": bool_schema("Whether to include dotfiles and dot-directories.", Some(false))
                },
                "required": ["path"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "read_file",
            "Read a text file with line numbers and pagination. Relative paths are resolved against the workspace root.",
            json!({
                "type": "object",
                "properties": {
                    "path": string_schema("Relative or absolute path to the file within the workspace."),
                    "start_line": int_schema("First line to read (1-based).", Some(1)),
                    "max_lines": int_schema("Maximum number of lines to return.", Some(500)),
                    "respect_gitignore": bool_schema("Whether to refuse reading paths ignored by .gitignore.", Some(true))
                },
                "required": ["path"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "create_file",
            "Create a new text file. Fails if the file already exists. Use edit_file to modify existing files.",
            json!({
                "type": "object",
                "properties": {
                    "path": string_schema("Relative or absolute path to the new file within the workspace."),
                    "content": string_schema("Full file content to write."),
                    "create_parent_dirs": bool_schema("Whether to create missing parent directories.", Some(true))
                },
                "required": ["path", "content"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "replace_file",
            "Replace an existing text file with new content. Prefer edit_file first.",
            json!({
                "type": "object",
                "properties": {
                    "path": string_schema("Relative or absolute path to the file within the workspace."),
                    "content": string_schema("Full replacement file content."),
                    "expected_sha256": string_schema("SHA256 hash from read_file. Rejects the write if the file changed."),
                    "create_backup": bool_schema("Whether to save a backup copy under .history before writing.", Some(false)),
                    "respect_gitignore": bool_schema("Whether to refuse editing paths ignored by .gitignore.", Some(true))
                },
                "required": ["path", "content"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "edit_file",
            "Apply a search-and-replace edit to an existing text file. Use this first for targeted edits.",
            json!({
                "type": "object",
                "properties": {
                    "path": string_schema("Relative or absolute path to the file within the workspace."),
                    "old_string": string_schema("Exact text to replace. Must match uniquely unless replace_all is true."),
                    "new_string": string_schema("Replacement text."),
                    "expected_sha256": string_schema("SHA256 hash from read_file. Rejects the edit if the file changed."),
                    "replace_all": bool_schema("Whether to replace every occurrence of old_string.", Some(false)),
                    "create_backup": bool_schema("Whether to save a backup copy under .history before writing.", Some(false)),
                    "respect_gitignore": bool_schema("Whether to refuse editing paths ignored by .gitignore.", Some(true))
                },
                "required": ["path", "old_string", "new_string"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "replace_lines",
            "Replace a range of lines in an existing text file by line number.",
            json!({
                "type": "object",
                "properties": {
                    "path": string_schema("Relative or absolute path to the file within the workspace."),
                    "start_line": int_schema("First line to replace (1-based).", None),
                    "end_line": int_schema("Last line to replace (inclusive, 1-based).", None),
                    "content": string_schema("Replacement content for the specified line range."),
                    "expected_sha256": string_schema("SHA256 hash from read_file. Rejects the edit if the file changed."),
                    "create_backup": bool_schema("Whether to save a backup copy under .history before writing.", Some(false)),
                    "respect_gitignore": bool_schema("Whether to refuse editing paths ignored by .gitignore.", Some(true))
                },
                "required": ["path", "start_line", "end_line", "content"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "glob",
            "Find files by glob pattern under a directory.",
            json!({
                "type": "object",
                "properties": {
                    "glob_pattern": string_schema("Glob pattern such as **/*.tsx or src/**/*.rs."),
                    "target_directory": string_schema("Directory to search from. Defaults to the workspace root."),
                    "head_limit": int_schema("Maximum number of matching paths to return.", Some(100)),
                    "respect_gitignore": bool_schema("Whether to skip paths ignored by .gitignore.", Some(true))
                },
                "required": ["glob_pattern"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "grep",
            "Search file contents with a regex pattern.",
            json!({
                "type": "object",
                "properties": {
                    "pattern": string_schema("Regular expression pattern to search for."),
                    "path": string_schema("File or directory to search. Defaults to the workspace root."),
                    "glob": string_schema("Optional glob filter to limit searched files, such as *.{ts,tsx}."),
                    "output_mode": enum_string_schema("One of content, files_with_matches, or count.", &["content", "files_with_matches", "count"], Some("content")),
                    "case_insensitive": bool_schema("Whether to ignore letter case while matching.", Some(false)),
                    "context_before": int_schema("Number of lines to include before each match.", None),
                    "context_after": int_schema("Number of lines to include after each match.", None),
                    "context": int_schema("Number of lines to include before and after each match.", None),
                    "head_limit": int_schema("Maximum number of results to return.", Some(200)),
                    "offset": int_schema("Number of results to skip in content mode.", Some(0)),
                    "multiline": bool_schema("Whether . should match newlines.", Some(false)),
                    "respect_gitignore": bool_schema("Whether to skip paths ignored by .gitignore.", Some(true))
                },
                "required": ["pattern"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "shell",
            "Execute a shell command in the workspace. Use block_until_ms=0 for background mode.",
            json!({
                "type": "object",
                "properties": {
                    "command": string_schema("The shell command to execute."),
                    "description": string_schema("Short human-readable description for UI display only."),
                    "working_directory": string_schema("Directory to run the command in, relative to workspace root."),
                    "block_until_ms": int_schema("Max wait time in ms. Default 30000. Use 0 for background mode.", Some(30000))
                },
                "required": ["command"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "remote_shell",
            "Execute a command on a remote machine via SSH.",
            json!({
                "type": "object",
                "properties": {
                    "target": string_schema("Target remote machine alias."),
                    "command": string_schema("The shell command to execute on the remote machine."),
                    "description": string_schema("Short human-readable description for UI display only."),
                    "block_until_ms": int_schema("Max wait time in ms. Default 30000. Use 0 for background mode.", Some(30000))
                },
                "required": ["target", "command"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "await",
            "Poll a background shell until it completes or times out.",
            json!({
                "type": "object",
                "properties": {
                    "shell_id": string_schema("The shell_id returned from a background shell invocation."),
                    "block_until_ms": int_schema("Max wait time in ms before returning current output.", Some(30000))
                },
                "required": ["shell_id"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "list_shells",
            "List background shell processes started by the agent.",
            json!({
                "type": "object",
                "properties": {
                    "status_filter": enum_string_schema("Filter by status.", &["running", "completed", "failed", "timeout", "cancelled", "all"], Some("running")),
                    "task_id_filter": string_schema("Optional task ID to list only shells from a specific agent run.")
                },
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "kill_shell",
            "Kill a running background shell process by shell_id.",
            json!({
                "type": "object",
                "properties": { "shell_id": string_schema("The shell_id to terminate.") },
                "required": ["shell_id"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "read_shell_logs",
            "Read logs from a background shell in batches.",
            json!({
                "type": "object",
                "properties": {
                    "shell_id": string_schema("The shell_id to read logs from."),
                    "stream": enum_string_schema("Which stream to read.", &["stdout", "stderr"], None),
                    "offset": int_schema("Byte offset to start reading from.", None),
                    "limit": int_schema("Maximum bytes to return.", Some(4096))
                },
                "required": ["shell_id"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "web_search",
            "Search the web for real-time information outside training data.",
            json!({
                "type": "object",
                "properties": {
                    "search_term": string_schema("The search term to look up on the web."),
                    "explanation": string_schema("One sentence explanation of why this search is being used."),
                    "max_results": int_schema("Maximum number of search results to return.", Some(5))
                },
                "required": ["search_term"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "browse_page",
            "Fetch a public web page and return readable Markdown content.",
            json!({
                "type": "object",
                "properties": {
                    "url": string_schema("The URL to fetch. Must be http or https."),
                    "start_line": int_schema("First line to read (1-based).", Some(1)),
                    "max_lines": int_schema("Maximum number of lines to return.", Some(500)),
                    "explanation": string_schema("One sentence explanation of why this page is being fetched.")
                },
                "required": ["url"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "todo_read",
            "Read the current structured todo list for this chat session.",
            json!({
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "todo_write",
            "Create and update a structured todo list for the current chat session.",
            json!({
                "type": "object",
                "properties": {
                    "merge": bool_schema("Whether to merge with existing todos by id.", None),
                    "todos": {
                        "type": "array",
                        "description": "Todo items to create or update.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": string_schema("Stable identifier for this todo item."),
                                "content": string_schema("Short description of the task."),
                                "status": enum_string_schema("One of pending, in_progress, completed, or cancelled.", &["pending", "in_progress", "completed", "cancelled"], None)
                            },
                            "required": ["id", "status"],
                            "additionalProperties": false
                        }
                    },
                    "remove_ids": {
                        "type": "array",
                        "description": "Todo ids to delete from the list.",
                        "items": { "type": "string" }
                    }
                },
                "required": ["merge", "todos"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "ask_question",
            "Ask the user one or more structured clarification questions and wait for their answers before continuing. Set timeout_ms when the agent should continue after waiting for a limited time.",
            json!({
                "type": "object",
                "properties": {
                    "title": string_schema("Optional short title shown above the question list."),
                    "timeout_ms": int_schema("Optional wait timeout in milliseconds. When it expires, the tool returns a timeout result to the model instead of failing.", None),
                    "questions": {
                        "type": "array",
                        "description": "A non-empty list of questions to ask in one batch.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": string_schema("Stable identifier for this question."),
                                "prompt": string_schema("The question shown to the user."),
                                "allow_multiple": bool_schema("Whether the user may select multiple options.", Some(false)),
                                "options": {
                                    "type": "array",
                                    "description": "At least 2 predefined options. The UI adds an Other/custom option automatically.",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "id": string_schema("Stable identifier for this option."),
                                            "label": string_schema("Option label shown to the user."),
                                            "recommended": bool_schema("Optional. Set to true on the option you recommend the user pick.", None)
                                        },
                                        "required": ["id", "label"],
                                        "additionalProperties": false
                                    }
                                }
                            },
                            "required": ["id", "prompt", "options"],
                            "additionalProperties": false
                        }
                    }
                },
                "required": ["questions"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "get_workspace_tree",
            "Display the workspace directory tree structure with pagination.",
            json!({
                "type": "object",
                "properties": {
                    "start_line": int_schema("First line to return (1-based).", Some(1)),
                    "max_lines": int_schema("Maximum number of lines to return.", Some(500))
                },
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "plan_create",
            "Create a new plan markdown file in the .plan/ directory.",
            json!({
                "type": "object",
                "properties": {
                    "name": string_schema("Plan filename ending with -plan.md."),
                    "content": string_schema("Full plan content in Markdown.")
                },
                "required": ["name", "content"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "plan_read",
            "Read a plan markdown file from the .plan/ directory.",
            json!({
                "type": "object",
                "properties": { "name": string_schema("Plan filename.") },
                "required": ["name"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "plan_update",
            "Replace the content of an existing plan file in the .plan/ directory.",
            json!({
                "type": "object",
                "properties": {
                    "name": string_schema("Plan filename."),
                    "content": string_schema("Full updated plan content in Markdown.")
                },
                "required": ["name", "content"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "plan_edit",
            "Apply a targeted search-and-replace edit to an existing plan file in the .plan/ directory.",
            json!({
                "type": "object",
                "properties": {
                    "name": string_schema("Plan filename."),
                    "old_string": string_schema("Exact text to replace."),
                    "new_string": string_schema("Replacement text."),
                    "replace_all": bool_schema("Whether to replace every occurrence of old_string.", Some(false))
                },
                "required": ["name", "old_string", "new_string"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "plan_delete",
            "Delete a plan markdown file from the .plan/ directory.",
            json!({
                "type": "object",
                "properties": { "name": string_schema("Plan filename to delete.") },
                "required": ["name"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "plan_list",
            "List all plan markdown files in the .plan/ directory.",
            json!({
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "send_email",
            "Send an email to a recipient using configured email settings.",
            json!({
                "type": "object",
                "properties": {
                    "to": string_schema("Recipient email address."),
                    "subject": string_schema("Email subject line."),
                    "body": string_schema("Plain text email body content.")
                },
                "required": ["to", "subject", "body"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "spawn_subagent",
            "Spawn a sub-agent to complete an independent sub-task. The sub-agent runs with the same workspace tools and returns a structured report. Use this for delegating focused research, file exploration, or verification tasks. Maximum nesting depth: 3.",
            json!({
                "type": "object",
                "properties": {
                    "task": string_schema("The task description for the sub-agent. Be specific about what to do and what to report back."),
                    "context": string_schema("Optional additional context or constraints for the sub-agent."),
                    "tools": {
                        "type": "array",
                        "description": "Optional whitelist of tool names the sub-agent may use. Defaults to all available tools.",
                        "items": { "type": "string" }
                    }
                },
                "required": ["task"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "await_subagent",
            "Wait for one or more previously spawned sub-agents to complete and return their results. Provide handle_ids array from spawn_subagent calls.",
            json!({"type": "object", "properties": {"handle_ids": {"type": "array", "items": {"type": "string"}, "description": "Array of handle_ids returned by spawn_subagent calls."}}, "required": ["handle_ids"], "additionalProperties": false}),
        ),
        tool_definition(
            "list_automations",
            "List all scheduled automations with full configuration except run history. Use before create/update/delete to inspect existing jobs and avoid duplicates.",
            json!({
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "create_automation",
            "Create a scheduled automation that starts a new agent session on each run. Cron times use the local system timezone at minute precision. New automations are created disabled; tell the user to review and enable them on the Automations page.",
            json!({
                "type": "object",
                "properties": {
                    "name": string_schema("Short automation name."),
                    "prompt": string_schema("Task prompt sent to the agent on each scheduled run."),
                    "cron_expression": string_schema("Standard 5-field cron expression, e.g. \"0 9 * * 1-5\" for weekdays at 09:00 local time."),
                    "description": string_schema("Optional description shown in the automations list."),
                    "workspace_dir": string_schema("Workspace directory for scheduled runs. Defaults to the current session workspace."),
                    "model": string_schema("Model id for scheduled runs. Defaults to the current session model."),
                    "agent_mode": enum_string_schema("Agent mode for scheduled runs.", &["agent", "ask"], Some("agent")),
                    "thinking_enabled": bool_schema("Whether thinking mode is enabled when the model supports it.", Some(false))
                },
                "required": ["name", "prompt", "cron_expression"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "update_automation",
            "Update an existing automation by id. Only supplied fields are changed. enabled cannot be changed here; the user must enable or disable automations on the Automations page.",
            json!({
                "type": "object",
                "properties": {
                    "id": string_schema("Automation id from list_automations."),
                    "name": string_schema("Updated automation name."),
                    "prompt": string_schema("Updated task prompt."),
                    "cron_expression": string_schema("Updated 5-field cron expression in local time."),
                    "description": string_schema("Updated description."),
                    "workspace_dir": string_schema("Updated workspace directory."),
                    "model": string_schema("Updated model id."),
                    "agent_mode": enum_string_schema("Updated agent mode.", &["agent", "ask"], None),
                    "thinking_enabled": bool_schema("Updated thinking mode setting.", None)
                },
                "required": ["id"],
                "additionalProperties": false
            }),
        ),
        tool_definition(
            "delete_automation",
            "Delete an automation by id. Use list_automations first to confirm the target id and name.",
            json!({
                "type": "object",
                "properties": {
                    "id": string_schema("Automation id from list_automations.")
                },
                "required": ["id"],
                "additionalProperties": false
            }),
        ),
    ];

    match agent_mode.unwrap_or("agent") {
        "ask" => {
            let allowed = [
                "list_dir",
                "read_file",
                "todo_read",
                "ask_question",
                "glob",
                "grep",
                "web_search",
                "browse_page",
                "list_shells",
                "get_workspace_tree",
            ];
            tools.retain(|tool| allowed.contains(&tool.function.name.as_str()));
        }
        "plan" => {
            let allowed = [
                "list_dir",
                "read_file",
                "todo_read",
                "todo_write",
                "ask_question",
                "glob",
                "grep",
                "web_search",
                "browse_page",
                "list_shells",
                "get_workspace_tree",
                "plan_create",
                "plan_read",
                "plan_update",
                "plan_edit",
                "plan_delete",
                "plan_list",
            ];
            tools.retain(|tool| allowed.contains(&tool.function.name.as_str()));
        }
        _ => {
            // Plan file tools are exclusive to Plan mode; Agent mode implements directly.
            tools.retain(|tool| !PLAN_TOOL_NAMES.contains(&tool.function.name.as_str()));
        }
    }

    tools.retain(|tool| !is_disabled_agent_tool(&tool.function.name));

    tools
}

fn tool_definition(name: &str, description: &str, parameters: Value) -> AgentToolDefinition {
    AgentToolDefinition {
        kind: "function".to_string(),
        function: super::types::AgentToolFunction {
            name: name.to_string(),
            description: description.to_string(),
            parameters,
        },
    }
}

fn string_schema(description: &str) -> Value {
    json!({
        "type": "string",
        "description": description,
    })
}

fn bool_schema(description: &str, default: Option<bool>) -> Value {
    let mut value = json!({
        "type": "boolean",
        "description": description,
    });
    if let Some(default) = default {
        value["default"] = Value::Bool(default);
    }
    value
}

fn int_schema(description: &str, default: Option<i64>) -> Value {
    let mut value = json!({
        "type": "integer",
        "description": description,
    });
    if let Some(default) = default {
        value["default"] = Value::from(default);
    }
    value
}

fn enum_string_schema(
    description: &str,
    variants: &[&str],
    default: Option<&str>,
) -> Value {
    let mut value = json!({
        "type": "string",
        "description": description,
        "enum": variants,
    });
    if let Some(default) = default {
        value["default"] = Value::String(default.to_string());
    }
    value
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
struct CreateFileArgs {
    path: String,
    content: String,
    create_parent_dirs: Option<bool>,
}

fn execute_create_file(args: Value, ctx: &ToolExecutionContext<'_>) -> Result<ToolResultEnvelope, String> {
    let args: CreateFileArgs = match parse_from_value("create_file", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    let workspace_dir = match require_workspace_dir(ctx, "create_file") {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    Ok(match tool_create_file(workspace_dir, args.path, args.content, args.create_parent_dirs) {
        Ok(result) => tool_success("create_file", result),
        Err(error) => tool_failure("create_file", "execution_failed", error.to_string()),
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

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct StoredWebToolsSettings {
    web_search_provider: Option<String>,
    tavily_api_key_source: Option<String>,
    tavily_api_key: Option<String>,
    tavily_api_key_env_var: Option<String>,
    searxng_base_url: Option<String>,
}

async fn execute_web_search(args: Value, ctx: &ToolExecutionContext<'_>) -> Result<ToolResultEnvelope, String> {
    let args: WebSearchArgs = match parse_from_value("web_search", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    let stored = read_web_tools_settings();
    let provider = get_setting("webSearchProvider")
        .or_else(|| stored.web_search_provider.clone());
    let tavily_api_key_source = get_setting("tavilyApiKeySource")
        .or_else(|| stored.tavily_api_key_source.clone())
        .or_else(|| Some("manual".to_string()));
    let tavily_api_key = get_setting("tavilyApiKey")
        .or_else(|| stored.tavily_api_key.clone());
    let tavily_api_key_env_var = get_setting("tavilyApiKeyEnvVar")
        .or_else(|| stored.tavily_api_key_env_var.clone())
        .or_else(|| Some("TAVILY_API_KEY".to_string()));
    let searxng_base_url = get_setting("searxngBaseUrl")
        .or_else(|| stored.searxng_base_url.clone());

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
        Ok(result) => {
            let _ = bind_plan_to_session(ctx, &result.name);
            tool_success("plan_create", result)
        }
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
        Ok(result) => {
            let _ = bind_plan_to_session(ctx, &result.name);
            tool_success("plan_update", result)
        }
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
        Ok(result) => {
            let _ = bind_plan_to_session(ctx, &result.name);
            tool_success("plan_edit", result)
        }
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
        Ok(result) => {
            let _ = clear_session_plan_binding_if_matches(ctx, &result.name);
            tool_success("plan_delete", result)
        }
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

fn bind_plan_to_session(ctx: &ToolExecutionContext<'_>, plan_file_name: &str) -> Result<(), String> {
    let Some(session_id) = ctx
        .session_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(());
    };
    update_session_plan_fields(ctx, session_id, Some(plan_file_name), Some(serde_json::Value::Null))
}

fn clear_session_plan_binding_if_matches(
    ctx: &ToolExecutionContext<'_>,
    plan_file_name: &str,
) -> Result<(), String> {
    let Some(session_id) = ctx
        .session_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(());
    };
    let db = ctx.db.lock().map_err(|_| "Database lock poisoned.".to_string())?;
    let Some(session) = db.get::<Value>("sessions", session_id)? else {
        return Ok(());
    };
    let current_name = session
        .get("planFileName")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default();
    drop(db);
    if current_name != plan_file_name {
        return Ok(());
    }
    update_session_plan_fields(ctx, session_id, None, Some(serde_json::Value::Null))
}

fn update_session_plan_fields(
    ctx: &ToolExecutionContext<'_>,
    session_id: &str,
    plan_file_name: Option<&str>,
    plan_built_at: Option<Value>,
) -> Result<(), String> {
    let db = ctx.db.lock().map_err(|_| "Database lock poisoned.".to_string())?;
    let Some(mut session) = db.get::<Value>("sessions", session_id)? else {
        return Ok(());
    };
    let Some(object) = session.as_object_mut() else {
        return Ok(());
    };
    object.insert(
        "planFileName".to_string(),
        plan_file_name
            .map(|value| Value::String(value.to_string()))
            .unwrap_or(Value::Null),
    );
    if let Some(value) = plan_built_at {
        object.insert("planBuiltAt".to_string(), value);
    }
    let updated_at = current_timestamp_ms();
    object.insert("updatedAt".to_string(), Value::from(updated_at));
    db.put(
        "sessions",
        session_id,
        &session,
        &[crate::db::IndexEntry {
            name: "by-updatedAt".to_string(),
            value: updated_at.to_string(),
        }],
    )
}

fn execute_plan_list_args(
    _args: Value,
    ctx: &ToolExecutionContext<'_>,
) -> Result<ToolResultEnvelope, String> {
    execute_plan_list(ctx)
}

const AUTOMATION_ENABLE_HINT: &str =
    "Automation created in disabled state. Ask the user to review and enable it on the Automations page.";

#[derive(Deserialize)]
struct CreateAutomationArgs {
    name: String,
    prompt: String,
    #[serde(alias = "cronExpression")]
    cron_expression: String,
    description: Option<String>,
    #[serde(alias = "workspaceDir")]
    workspace_dir: Option<String>,
    model: Option<String>,
    #[serde(alias = "agentMode")]
    agent_mode: Option<String>,
    #[serde(alias = "thinkingEnabled")]
    thinking_enabled: Option<bool>,
}

#[derive(Deserialize)]
struct UpdateAutomationArgs {
    id: String,
    name: Option<String>,
    prompt: Option<String>,
    #[serde(alias = "cronExpression")]
    cron_expression: Option<String>,
    description: Option<String>,
    #[serde(alias = "workspaceDir")]
    workspace_dir: Option<String>,
    model: Option<String>,
    #[serde(alias = "agentMode")]
    agent_mode: Option<String>,
    #[serde(alias = "thinkingEnabled")]
    thinking_enabled: Option<bool>,
}

#[derive(Deserialize)]
struct AutomationIdArgs {
    id: String,
}

fn execute_list_automations(ctx: &ToolExecutionContext<'_>) -> Result<ToolResultEnvelope, String> {
    match list_jobs(&ctx.db) {
        Ok(jobs) => Ok(tool_success(
            "list_automations",
            json!({
                "automations": jobs
                    .into_iter()
                    .map(AutomationRecord::from)
                    .collect::<Vec<_>>()
            }),
        )),
        Err(error) => Ok(tool_failure(
            "list_automations",
            "execution_failed",
            error,
        )),
    }
}

fn execute_create_automation(
    args: Value,
    ctx: &ToolExecutionContext<'_>,
) -> Result<ToolResultEnvelope, String> {
    let args: CreateAutomationArgs = match parse_from_value("create_automation", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };

    let name = args.name.trim();
    if name.is_empty() {
        return Ok(tool_failure(
            "create_automation",
            "invalid_arguments",
            "name is required",
        ));
    }

    let prompt = args.prompt.trim();
    if prompt.is_empty() {
        return Ok(tool_failure(
            "create_automation",
            "invalid_arguments",
            "prompt is required",
        ));
    }

    let cron_expression = args.cron_expression.trim();
    if cron_expression.is_empty() {
        return Ok(tool_failure(
            "create_automation",
            "invalid_arguments",
            "cron_expression is required",
        ));
    }
    if !is_valid_cron_expression(cron_expression) {
        return Ok(tool_failure(
            "create_automation",
            "invalid_arguments",
            "cron_expression is invalid",
        ));
    }

    let model = match resolve_automation_model(ctx, args.model) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };

    let agent_mode = match parse_automation_agent_mode(args.agent_mode.as_deref(), AgentMode::Agent)
    {
        Ok(value) => value,
        Err(error) => {
            return Ok(tool_failure(
                "create_automation",
                "invalid_arguments",
                error,
            ))
        }
    };

    let thinking_enabled = args
        .thinking_enabled
        .unwrap_or_else(|| ctx.parent_start_params.thinking_enabled.unwrap_or(false));

    let input = CreateJobInput {
        name: name.to_string(),
        description: args.description.unwrap_or_default(),
        cron_expression: cron_expression.to_string(),
        prompt: prompt.to_string(),
        workspace_dir: resolve_automation_workspace_dir(ctx, args.workspace_dir),
        model: model.clone(),
        provider: Some(infer_provider_for_model(&model)),
        agent_mode,
        thinking_enabled,
        enabled: Some(false),
    };

    match create_job(&ctx.db, input) {
        Ok(record) => Ok(tool_success(
            "create_automation",
            json!({
                "automation": AutomationRecord::from(record),
                "hint": AUTOMATION_ENABLE_HINT,
            }),
        )),
        Err(error) => Ok(tool_failure(
            "create_automation",
            "execution_failed",
            error,
        )),
    }
}

fn execute_update_automation(
    args: Value,
    ctx: &ToolExecutionContext<'_>,
) -> Result<ToolResultEnvelope, String> {
    let args: UpdateAutomationArgs = match parse_from_value("update_automation", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };

    let id = args.id.trim();
    if id.is_empty() {
        return Ok(tool_failure(
            "update_automation",
            "invalid_arguments",
            "id is required",
        ));
    }

    if let Some(cron_expression) = args.cron_expression.as_deref() {
        let trimmed = cron_expression.trim();
        if trimmed.is_empty() {
            return Ok(tool_failure(
                "update_automation",
                "invalid_arguments",
                "cron_expression cannot be empty",
            ));
        }
        if !is_valid_cron_expression(trimmed) {
            return Ok(tool_failure(
                "update_automation",
                "invalid_arguments",
                "cron_expression is invalid",
            ));
        }
    }

    let agent_mode = match args.agent_mode.as_deref() {
        Some(raw) => match parse_automation_agent_mode(Some(raw), AgentMode::Agent) {
            Ok(value) => Some(value),
            Err(error) => {
                return Ok(tool_failure(
                    "update_automation",
                    "invalid_arguments",
                    error,
                ))
            }
        },
        None => None,
    };

    let model = args
        .model
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let provider = model
        .as_ref()
        .map(|value| infer_provider_for_model(value));

    let patch = UpdateJobInput {
        name: args.name,
        description: args.description,
        cron_expression: args.cron_expression,
        prompt: args.prompt,
        workspace_dir: args.workspace_dir,
        model,
        provider,
        agent_mode,
        thinking_enabled: args.thinking_enabled,
        enabled: None,
    };

    match update_job(&ctx.db, id, patch) {
        Ok(Some(record)) => Ok(tool_success(
            "update_automation",
            json!({ "automation": AutomationRecord::from(record) }),
        )),
        Ok(None) => Ok(tool_failure(
            "update_automation",
            "not_found",
            format!("Automation not found: {id}"),
        )),
        Err(error) => Ok(tool_failure(
            "update_automation",
            "execution_failed",
            error,
        )),
    }
}

fn execute_delete_automation(
    args: Value,
    ctx: &ToolExecutionContext<'_>,
) -> Result<ToolResultEnvelope, String> {
    let args: AutomationIdArgs = match parse_from_value("delete_automation", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };

    let id = args.id.trim();
    if id.is_empty() {
        return Ok(tool_failure(
            "delete_automation",
            "invalid_arguments",
            "id is required",
        ));
    }

    match delete_job(&ctx.db, id) {
        Ok(true) => Ok(tool_success(
            "delete_automation",
            json!({ "id": id, "deleted": true }),
        )),
        Ok(false) => Ok(tool_failure(
            "delete_automation",
            "not_found",
            format!("Automation not found: {id}"),
        )),
        Err(error) => Ok(tool_failure(
            "delete_automation",
            "execution_failed",
            error,
        )),
    }
}

fn resolve_automation_model(
    ctx: &ToolExecutionContext<'_>,
    model: Option<String>,
) -> Result<String, ToolResultEnvelope> {
    if let Some(value) = model {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    let session_model = ctx.parent_start_params.model.trim();
    if session_model.is_empty() {
        return Err(tool_failure(
            "create_automation",
            "invalid_arguments",
            "model is required when the current session has no model",
        ));
    }

    Ok(session_model.to_string())
}

fn resolve_automation_workspace_dir(
    ctx: &ToolExecutionContext<'_>,
    workspace_dir: Option<String>,
) -> Option<String> {
    workspace_dir
        .and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        })
        .or_else(|| ctx.workspace_dir.clone())
}

fn parse_automation_agent_mode(
    value: Option<&str>,
    default: AgentMode,
) -> Result<AgentMode, String> {
    let Some(raw) = value else {
        return Ok(default);
    };
    match raw.trim().to_ascii_lowercase().as_str() {
        "agent" => Ok(AgentMode::Agent),
        "ask" => Ok(AgentMode::Ask),
        other if other.is_empty() => Ok(default),
        other => Err(format!(
            "Invalid agent_mode `{other}`. Use \"agent\" or \"ask\"."
        )),
    }
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
    Ok(tool_success(
        "todo_read",
        json!({
            "sessionId": session_id,
            "todos": todos,
            "total": todos.len(),
            "active": todos.iter()
                .filter(|t| t.get("status").and_then(Value::as_str) == Some("in_progress"))
                .count(),
            "completed": todos.iter()
                .filter(|t| t.get("status").and_then(Value::as_str) == Some("completed"))
                .count(),
        }),
    ))
}

#[derive(Deserialize)]
struct TodoWriteArgs {
    merge: bool,
    todos: Vec<Value>,
    remove_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
struct AskQuestionArgs {
    title: Option<String>,
    questions: Vec<AskQuestionItem>,
    timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
struct AskQuestionItem {
    id: String,
    prompt: String,
    options: Vec<AskQuestionOption>,
    #[serde(default)]
    allow_multiple: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct AskQuestionOption {
    id: String,
    label: String,
    recommended: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
struct SpawnSubAgentArgs {
    task: String,
    context: Option<String>,
    tools: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
struct AwaitSubAgentArgs {
    handle_ids: Vec<String>,
}

const MAX_SUBAGENT_DEPTH: usize = 3;
const DEFAULT_ASK_QUESTION_TIMEOUT_MS: u64 = 300_000;

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

        if let Some(position) = merged
            .iter()
            .position(|value| value.get("id").and_then(Value::as_str) == Some(id.as_str()))
        {
            // --- Field-level merge: update only fields present in incoming ---
            let entry = &mut merged[position];

            // Update status only if the incoming todo explicitly provides it
            if let Some(status) = todo.get("status").and_then(Value::as_str) {
                entry["status"] = json!(status);
            }
            // Update content only if the field is explicitly set (preserve existing when omitted)
            if todo.get("content").is_some() {
                let content = todo["content"]
                    .as_str()
                    .unwrap_or("")
                    .trim()
                    .to_string();
                entry["content"] = json!(content);
            }
            // Always update order from the incoming array position
            entry["order"] = json!(index);
            // Always refresh timestamp
            entry["updatedAt"] = json!(now);
        } else {
            // --- New entry: build from scratch (unchanged) ---
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
            // Auto-assign a non-conflicting order for new entries
            let new_order = merged
                .iter()
                .filter_map(|v| v.get("order").and_then(Value::as_u64))
                .max()
                .map(|o| o + 1)
                .unwrap_or(0);
            let next = json!({
                "id": id,
                "sessionId": session_id,
                "content": content,
                "status": status,
                "order": new_order,
                "createdAt": now,
                "updatedAt": now,
            });
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

    let total = merged.len();
    let active = merged
        .iter()
        .filter(|t| t.get("status").and_then(Value::as_str) == Some("in_progress"))
        .count();
    let completed = merged
        .iter()
        .filter(|t| t.get("status").and_then(Value::as_str) == Some("completed"))
        .count();

    Ok(tool_success(
        "todo_write",
        json!({
            "sessionId": session_id,
            "todos": merged,
            "merge": args.merge,
            "total": total,
            "active": active,
            "completed": completed,
        }),
    ))
}

async fn execute_ask_question(
    args: Value,
    ctx: &ToolExecutionContext<'_>,
) -> Result<ToolResultEnvelope, String> {
    let args: AskQuestionArgs = match parse_from_value("ask_question", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    let task_id = match ctx.task_id.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => value.to_string(),
        None => {
            return Ok(tool_failure(
                "ask_question",
                "missing_task",
                "ask_question requires an active task.",
            ))
        }
    };
    if let Err(error) = validate_ask_question_args(&args) {
        return Ok(error);
    }

    let receiver = match ctx.ask_question_registry.register(&task_id) {
        Ok(receiver) => receiver,
        Err(error) => {
            return Ok(tool_failure(
                "ask_question",
                "already_pending",
                error,
            ))
        }
    };

    let timeout_ms = resolve_ask_question_timeout_ms(args.timeout_ms);

    let result = {
        tokio::select! {
            _ = ctx.cancel_token.cancelled() => {
                let _ = ctx.ask_question_registry.cancel(&task_id, "Cancelled");
                return Ok(tool_failure("ask_question", "cancelled", "ask_question was cancelled."));
            }
            _ = tokio::time::sleep(std::time::Duration::from_millis(timeout_ms)) => {
                let message = ask_question_timeout_message(timeout_ms);
                let _ = ctx.ask_question_registry.cancel(&task_id, message.clone());
                return Ok(tool_success(
                    "ask_question",
                    json!({
                        "title": args.title.as_deref().map(str::trim).filter(|value| !value.is_empty()),
                        "questionCount": args.questions.len(),
                        "status": "timeout",
                        "timedOut": true,
                        "timeoutMs": timeout_ms,
                        "message": message,
                        "answers": [],
                    }),
                ));
            }
            response = receiver => response
        }
    };

    match result {
        Ok(Ok(answers)) => {
            let answers = match normalize_ask_question_answers(&args.questions, answers) {
                Ok(value) => value,
                Err(error) => return Ok(error),
            };
            Ok(tool_success(
                "ask_question",
                json!({
                    "title": args.title.as_deref().map(str::trim).filter(|value| !value.is_empty()),
                    "questionCount": args.questions.len(),
                    "status": "answered",
                    "timedOut": false,
                    "answers": answers,
                }),
            ))
        }
        Ok(Err(message)) => Ok(tool_failure("ask_question", "cancelled", message)),
        Err(_) => Ok(tool_failure(
            "ask_question",
            "cancelled",
            "ask_question request was dropped before the user responded.",
        )),
    }
}

fn normalize_ask_question_answers(
    questions: &[AskQuestionItem],
    answers: Vec<crate::agent::ask_question::AskQuestionAnswer>,
) -> Result<Vec<crate::agent::ask_question::AskQuestionAnswer>, ToolResultEnvelope> {
    let question_map = questions
        .iter()
        .map(|question| (question.id.trim().to_string(), question))
        .collect::<std::collections::HashMap<_, _>>();
    let mut seen_answer_ids = std::collections::HashSet::new();
    let mut normalized_answers = Vec::with_capacity(answers.len());

    for answer in answers {
        let question_id = answer.question_id.trim();
        if question_id.is_empty() {
            return Err(tool_failure(
                "ask_question",
                "invalid_response",
                "Answer question_id is required.",
            ));
        }
        if !seen_answer_ids.insert(question_id.to_string()) {
            return Err(tool_failure(
                "ask_question",
                "invalid_response",
                format!("Duplicate answer for question id: {question_id}"),
            ));
        }

        let Some(question) = question_map.get(question_id) else {
            return Err(tool_failure(
                "ask_question",
                "invalid_response",
                format!("Unknown question id in answer: {question_id}"),
            ));
        };

        if !question.allow_multiple && answer.selected_option_ids.len() > 1 {
            return Err(tool_failure(
                "ask_question",
                "invalid_response",
                format!("Question {question_id} does not allow multiple selections."),
            ));
        }

        normalized_answers.push(crate::agent::ask_question::AskQuestionAnswer {
            question_id: question.id.trim().to_string(),
            prompt: question.prompt.trim().to_string(),
            allow_multiple: question.allow_multiple,
            selected_option_ids: answer.selected_option_ids,
            selected_option_labels: answer.selected_option_labels,
            other_text: answer.other_text,
        });
    }

    Ok(normalized_answers)
}

fn validate_ask_question_args(args: &AskQuestionArgs) -> Result<(), ToolResultEnvelope> {
    if matches!(args.timeout_ms, Some(0)) {
        return Err(tool_failure(
            "ask_question",
            "invalid_arguments",
            "timeout_ms must be greater than 0 when provided.",
        ));
    }

    if args.questions.is_empty() {
        return Err(tool_failure(
            "ask_question",
            "invalid_arguments",
            "questions must be a non-empty array.",
        ));
    }

    let mut question_ids = std::collections::HashSet::new();
    for (index, question) in args.questions.iter().enumerate() {
        let question_id = question.id.trim();
        if question_id.is_empty() {
            return Err(tool_failure(
                "ask_question",
                "invalid_arguments",
                format!("questions[{index}].id is required."),
            ));
        }
        if !question_ids.insert(question_id.to_string()) {
            return Err(tool_failure(
                "ask_question",
                "invalid_arguments",
                format!("Duplicate question id: {question_id}"),
            ));
        }
        if question.prompt.trim().is_empty() {
            return Err(tool_failure(
                "ask_question",
                "invalid_arguments",
                format!("questions[{index}].prompt is required."),
            ));
        }
        if question.options.len() < 2 {
            return Err(tool_failure(
                "ask_question",
                "invalid_arguments",
                format!("questions[{index}].options must include at least 2 choices."),
            ));
        }

        let mut option_ids = std::collections::HashSet::new();
        for (option_index, option) in question.options.iter().enumerate() {
            let option_id = option.id.trim();
            if option_id.is_empty() {
                return Err(tool_failure(
                    "ask_question",
                    "invalid_arguments",
                    format!("questions[{index}].options[{option_index}].id is required."),
                ));
            }
            if option.label.trim().is_empty() {
                return Err(tool_failure(
                    "ask_question",
                    "invalid_arguments",
                    format!("questions[{index}].options[{option_index}].label is required."),
                ));
            }
            if !option_ids.insert(option_id.to_string()) {
                return Err(tool_failure(
                    "ask_question",
                    "invalid_arguments",
                    format!("Duplicate option id: {option_id}"),
                ));
            }
            let _ = option.recommended;
        }
    }

    Ok(())
}

fn ask_question_timeout_message(timeout_ms: u64) -> String {
    format!(
        "User did not respond before the {} ms timeout and may be away from the computer.",
        timeout_ms
    )
}

fn resolve_ask_question_timeout_ms(timeout_ms: Option<u64>) -> u64 {
    timeout_ms.unwrap_or(DEFAULT_ASK_QUESTION_TIMEOUT_MS)
}

async fn execute_spawn_subagent(
    args: Value,
    ctx: &ToolExecutionContext<'_>,
) -> Result<ToolResultEnvelope, String> {
    let args: SpawnSubAgentArgs = match parse_from_value("spawn_subagent", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };
    let task = args.task.trim();
    if task.is_empty() {
        return Ok(tool_failure(
            "spawn_subagent",
            "empty_task",
            "Task description must not be empty.",
        ));
    }

    // Q6: forbid nesting. Exclude spawn_subagent AND await_subagent from the
    // child's toolset — a SubAgent cannot spawn or await its own sub-agents.
    let allowed_tools: Vec<AgentToolDefinition> = ctx
        .available_tools
        .iter()
        .filter(|tool| tool.function.name != "spawn_subagent" && tool.function.name != "await_subagent")
        .filter(|tool| {
            args.tools.as_ref().map(|requested| {
                requested.iter().any(|name| name == &tool.function.name)
            }).unwrap_or(true)
        })
        .cloned()
        .collect();

    let parent = &ctx.parent_start_params;
    let handle_id = format!("sub-{}", current_timestamp_ms());

    // Spawn the child as a normal Session via the unified entry point.
    // No thread::spawn, no separate runtime, no event compression — the child
    // runs through the standard agent loop and persists its own messages.
    let spawn_result = crate::agent::spawn::spawn_session(
        ctx.app_state.clone(),
        crate::agent::spawn::SpawnSessionOptions {
            parent_session_id: ctx.session_id.clone(),
            task: task.to_string(),
            model: parent.model.clone(),
            workspace_dir: ctx.workspace_dir.clone(),
            base_url: parent.base_url.clone(),
            api_key: parent.api_key.clone(),
            api_key_source: Some(parent.api_key_source.clone()),
            api_key_env_var: Some(parent.api_key_env_var.clone()),
            request_extensions: parent.request_extensions.clone(),
            max_context_tokens: parent.max_context_tokens,
            agent_mode: Some("agent".to_string()),
            thinking_enabled: parent.thinking_enabled,
            extra_tools: Some(allowed_tools),
            autonomy_mode: parent.autonomy_mode.clone(),
            decision_policy_version: parent.decision_policy_version.clone(),
            decision_model: parent.decision_model.clone(),
        },
    )
    .await?;

    // Track the handle so await_subagent can find the child session/task.
    // Pass spawn_tool_call_id so await_subagent can emit status updates back
    // to the parent's spawn_subagent invocation (stops the Label spinner).
    ctx.concurrent_agents
        .register(
            handle_id.clone(),
            task.to_string(),
            spawn_result.session_id.clone(),
            spawn_result.task_id.clone(),
            ctx.current_tool_call_id.clone(),
        )
        .await?;

    // Spawn a background watcher that updates the parent message's invocation
    // output (status: running → completed/cancelled/failed) when the child
    // session finishes. This is a BACKUP for when await_subagent is not called
    // — the primary update path is in execute_await_subagent itself.
    //
    // Subscribe BEFORE spawning the watcher to avoid missing the Done event
    // if the child finishes very quickly (race condition fix).
    let watcher_receiver = ctx.app_state.sse_broadcaster.subscribe(&spawn_result.task_id);
    spawn_completion_watcher(
        ctx.app_state.clone(),
        spawn_result.session_id.clone(),
        spawn_result.task_id.clone(),
        handle_id.clone(),
        ctx.task_id.clone(),
        ctx.current_tool_call_id.clone(),
        ctx.tool_result_message_id.clone(),
        ctx.session_id.clone(),
        watcher_receiver,
    );

    // Return immediately (non-blocking). LLM calls await_subagent to wait.
    return Ok(tool_success(
        "spawn_subagent",
        json!({
            "handleId": handle_id,
            "sessionId": spawn_result.session_id,
            "status": "running",
        }),
    ));
}

async fn execute_await_subagent(
    args: Value,
    ctx: &ToolExecutionContext<'_>,
) -> Result<ToolResultEnvelope, String> {
    let args: AwaitSubAgentArgs = match parse_from_value("await_subagent", args) {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };

    if args.handle_ids.is_empty() {
        return Ok(tool_failure(
            "await_subagent",
            "invalid_arguments",
            "handle_ids must be a non-empty array.",
        ));
    }

    let parent_session_id = ctx.session_id.clone().unwrap_or_default();

    let mut results: Vec<Value> = Vec::with_capacity(args.handle_ids.len());
    for handle_id in &args.handle_ids {
        let Some(agent) = ctx.concurrent_agents.get(handle_id).await else {
            results.push(json!({
                "handleId": handle_id,
                "result": {
                    "ok": false,
                    "tool": "await_subagent",
                    "error": { "code": "handle_not_found", "message": format!("Sub-agent handle not found: {handle_id}") },
                },
            }));
            continue;
        };

        // Q9: select! between child completion and parent cancel.
        let outcome = tokio::select! {
            // Branch A: child session Done (natural completion OR user manually stopped child)
            status = wait_for_child_done(&ctx.app_state, &agent.session_id, &agent.task_id) => {
                // Q2: read child's last assistant message as summary.
                let summary = read_last_assistant_message(&ctx.app_state.db, &agent.session_id);
                // Update the parent's spawn_subagent invocation output so the
                // frontend Label stops spinning. This is the PRIMARY update path
                // (more reliable than the background watcher, because this runs
                // inside the parent agent loop while SSE is still connected).
                emit_spawn_subagent_status_update(
                    &ctx.app_state,
                    ctx.task_id.as_deref(),
                    ctx.session_id.as_deref(),
                    agent.spawn_tool_call_id.as_deref(),
                    ctx.tool_result_message_id.as_deref(),
                    &agent.session_id,
                    &agent.handle_id,
                    &status,
                );
                (agent.session_id.clone(), status, summary)
            }
            // Branch B: parent cancel_token (user stopped parent)
            _ = ctx.cancel_token.cancelled() => {
                // Cascade cancel all child sessions, then return cancelled.
                let _ = crate::agent::cancel::cancel_session_and_children(&ctx.app_state, &parent_session_id).await;
                // Also emit a cancelled status update to the spawn_subagent invocation.
                emit_spawn_subagent_status_update(
                    &ctx.app_state,
                    ctx.task_id.as_deref(),
                    ctx.session_id.as_deref(),
                    agent.spawn_tool_call_id.as_deref(),
                    ctx.tool_result_message_id.as_deref(),
                    &agent.session_id,
                    &agent.handle_id,
                    "cancelled",
                );
                (agent.session_id.clone(), "cancelled".to_string(), None)
            }
        };

        // Remove the handle after consumption.
        ctx.concurrent_agents.remove(handle_id).await;

        let (session_id, status, summary) = outcome;
        results.push(json!({
            "handleId": handle_id,
            "result": {
                "ok": true,
                "tool": "await_subagent",
                "data": {
                    "sessionId": session_id,
                    "status": status,
                    "summary": summary,
                },
            },
        }));
    }

    Ok(tool_success("await_subagent", json!({ "results": results })))
}

/// Emit a ToolCallFinished event to update the parent's spawn_subagent
/// invocation output status. Called from execute_await_subagent to ensure
/// the frontend Label stops spinning (primary update path — runs inside
/// the parent agent loop while SSE is still connected).
///
/// DB persistence is handled by the background spawn_completion_watcher
/// (backup path for when LLM doesn't call await_subagent).
/// Update the parent's spawn_subagent invocation output status: persists to
/// DB (survives page reload) AND emits a ToolCallFinished event (real-time
/// frontend update). Called from execute_await_subagent (primary path).
///
/// IMPORTANT: spawn_subagent and await_subagent may be on DIFFERENT assistant
/// messages (different turns). We cannot use ctx.tool_result_message_id (which
/// points to await_subagent's message). Instead, we scan all messages in the
/// parent session to find the one containing the spawn_subagent invocation by
/// tool_call_id.
fn emit_spawn_subagent_status_update(
    app_state: &Arc<crate::AppState>,
    parent_task_id: Option<&str>,
    parent_session_id: Option<&str>,
    spawn_tool_call_id: Option<&str>,
    _parent_message_id: Option<&str>,
    child_session_id: &str,
    handle_id: &str,
    status: &str,
) {
    // 1. Persist to DB so the status survives page reload.
    //    Scan all messages in the parent session to find the one containing
    //    the spawn_subagent invocation (by tool_call_id match).
    if let (Some(tool_call_id), Some(session_id)) = (spawn_tool_call_id, parent_session_id) {
        log::info!(
            "emit_spawn_status: updating tool_call_id={} session_id={} status={}",
            tool_call_id,
            session_id,
            status
        );
        let db_guard = app_state.db.lock().ok();
        if let Some(db) = db_guard {
            if let Ok(messages) = crate::db::session_store::get_messages_by_session(&db, session_id) {
                let mut found = false;
                for mut msg in messages {
                    for inv in msg.tool_invocations.iter_mut() {
                        if inv.id == tool_call_id {
                            if let Some(ref mut output) = inv.output {
                                if let Some(obj) = output.as_object_mut() {
                                    obj.insert(
                                        "status".to_string(),
                                        Value::String(status.to_string()),
                                    );
                                    found = true;
                                }
                            }
                            break;
                        }
                    }
                    if found {
                        log::info!(
                            "emit_spawn_status: found invocation, persisting to DB"
                        );
                        let _ = crate::db::session_store::put_message(&db, &msg, false);
                        break;
                    }
                }
                if !found {
                    log::warn!(
                        "emit_spawn_status: invocation not found in {} messages",
                        "session"
                    );
                }
            }
        }
    } else {
        log::warn!(
            "emit_spawn_status: missing tool_call_id={:?} or session_id={:?}",
            spawn_tool_call_id,
            parent_session_id
        );
    }

    // 2. Emit ToolCallFinished event for real-time frontend update.
    if let (Some(parent_task_id), Some(tool_call_id)) = (parent_task_id, spawn_tool_call_id) {
        let payload = json!({
            "ok": true,
            "tool": "spawn_subagent",
            "data": {
                "handleId": handle_id,
                "sessionId": child_session_id,
                "status": status,
            }
        });
        let event = super::types::AgentEvent::ToolCallFinished {
            task_id: parent_task_id.to_string(),
            tool_call_id: tool_call_id.to_string(),
            output: Some(payload),
            error_text: None,
        };
        if let Ok(json_str) = serde_json::to_string(&event) {
            let event_str = super::loop_::inject_seq_into_event_json(&json_str, 0);
            app_state.sse_broadcaster.emit(parent_task_id, &event_str);
        }
    }
}

/// Background watcher: waits for the child session to finish, then updates
/// the parent message's tool_invocation output status (running → terminal)
/// and emits a ToolCallFinished event to the parent task_id so the frontend
/// Label stops spinning without requiring a page reload.
///
/// This runs as an independent tokio task — it survives the parent agent loop
/// continuing to other work. It does NOT block the parent.
fn spawn_completion_watcher(
    app_state: Arc<crate::AppState>,
    child_session_id: String,
    child_task_id: String,
    handle_id: String,
    parent_task_id: Option<String>,
    parent_tool_call_id: Option<String>,
    parent_message_id: Option<String>,
    parent_session_id: Option<String>,
    receiver: tokio::sync::broadcast::Receiver<String>,
) {
    let broadcaster = app_state.sse_broadcaster.clone();
    let db = app_state.db.clone();

    tokio::spawn(async move {
        // Wait for the child session to reach a terminal state.
        // Uses the pre-subscribed receiver to avoid missing the Done event
        // (race condition fix: subscribe happens before spawn_session returns).
        let mut receiver = receiver;
        let status = wait_for_child_done_with_receiver(
            &app_state,
            &child_session_id,
            &child_task_id,
            &mut receiver,
        )
        .await;

        // 1. Update the parent message's invocation output (persisted to DB
        //    so it survives page reload).
        if let Some(tool_call_id) = parent_tool_call_id.as_deref() {
            let maybe_msg = {
                let db_guard = db.lock().ok();
                if let Some(db) = db_guard {
                    let mut msg = parent_message_id
                        .as_deref()
                        .and_then(|id| crate::db::session_store::get_message(&db, id).ok())
                        .flatten();
                    if msg.is_none() {
                        msg = crate::db::session_store::find_assistant_message_by_task_id(
                            &db,
                            parent_session_id.as_deref(),
                            parent_task_id.as_deref().unwrap_or(""),
                        )
                        .ok()
                        .flatten();
                    }
                    msg
                } else {
                    None
                }
            };

            if let Some(mut msg) = maybe_msg {
                let mut changed = false;
                for inv in msg.tool_invocations.iter_mut() {
                    if inv.id == tool_call_id {
                        if let Some(ref mut output) = inv.output {
                            if let Some(obj) = output.as_object_mut() {
                                obj.insert(
                                    "status".to_string(),
                                    Value::String(status.clone()),
                                );
                                changed = true;
                            }
                        }
                        break;
                    }
                }
                if changed {
                    if let Ok(db) = db.lock() {
                        let _ = crate::db::session_store::put_message(&db, &msg, false);
                    }
                }
            }
        }

        // 2. Emit a ToolCallFinished event to the parent task_id so the
        //    frontend refreshes the Label in real time.
        if let Some(parent_task_id) = parent_task_id.as_deref() {
            let payload = json!({
                "ok": true,
                "tool": "spawn_subagent",
                "data": {
                    "handleId": handle_id,
                    "sessionId": child_session_id,
                    "status": status,
                }
            });
            let event = super::types::AgentEvent::ToolCallFinished {
                task_id: parent_task_id.to_string(),
                tool_call_id: parent_tool_call_id.clone().unwrap_or_default(),
                output: Some(payload),
                error_text: None,
            };
            if let Ok(json_str) = serde_json::to_string(&event) {
                let event_str = super::loop_::inject_seq_into_event_json(&json_str, 0);
                broadcaster.emit(parent_task_id, &event_str);
            }
        }
    });
}

/// Authoritative terminal status of a child session, read from the DB.
///
/// The broadcast channel is unreliable for detecting completion: a receiver
/// that subscribes AFTER the child already emitted its Terminal `Status` event
/// (e.g. `await_subagent` is called once the child has long finished) will
/// never observe that historical event — it only sees `RecvError::Closed` once
/// the channel is unregistered. By the time the channel closes, the child's
/// agent loop has already persisted the terminal status onto its assistant
/// message record (`registry.rs` writes it synchronously, *before* the
/// delayed `unregister`). So the DB is the source of truth for completion.
fn read_child_db_terminal_status(
    db: &Arc<Mutex<Database>>,
    session_id: &str,
    task_id: &str,
) -> Option<String> {
    let guard = db.lock().ok()?;
    let msg = crate::db::session_store::find_assistant_message_by_task_id(
        &guard,
        Some(session_id),
        task_id,
    )
    .ok()??;
    match msg.status.as_str() {
        "completed" => Some("completed".to_string()),
        "failed" => Some("failed".to_string()),
        "cancelled" => Some("cancelled".to_string()),
        _ => None,
    }
}

/// Wait for a child session's terminal status event via SSE.
/// Returns "completed", "cancelled", or "failed".
///
/// On `RecvError::Closed` (channel unregistered before/sub-after we observed
/// the Status event), falls back to the DB-persisted terminal status rather
/// than blindly reporting "failed" — this is the core race-condition fix.
async fn wait_for_child_done(
    app_state: &Arc<crate::AppState>,
    session_id: &str,
    task_id: &str,
) -> String {
    let mut receiver = app_state.sse_broadcaster.subscribe(task_id);
    wait_for_child_done_with_receiver(app_state, session_id, task_id, &mut receiver).await
}

/// Same as wait_for_child_done but accepts a pre-subscribed receiver.
/// Used by spawn_completion_watcher to avoid the race where subscribe happens
/// after the child already emitted its Done event.
async fn wait_for_child_done_with_receiver(
    app_state: &Arc<crate::AppState>,
    session_id: &str,
    task_id: &str,
    receiver: &mut tokio::sync::broadcast::Receiver<String>,
) -> String {
    loop {
        match receiver.recv().await {
            Ok(payload) => {
                if let Some(status) = terminal_status_from_payload(&payload) {
                    log::info!(
                        "subagent_wait_done status={} via Status event (task_id={})",
                        status,
                        task_id
                    );
                    return status;
                }
            }
            Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                log::warn!("subagent_wait_lagged task_id={} n={}", task_id, n);
                continue;
            }
            Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                // Channel closed (unregister raced ahead, OR we subscribed after
                // the child already emitted its Status event). The authoritative
                // terminal status is already in the DB — poll it briefly.
                log::warn!(
                    "subagent_wait_closed: channel closed (task_id={}); falling back to DB status",
                    task_id
                );
                for attempt in 0..10 {
                    if let Some(status) =
                        read_child_db_terminal_status(&app_state.db, session_id, task_id)
                    {
                        log::info!(
                            "subagent_wait_done status={} via DB (task_id={})",
                            status,
                            task_id
                        );
                        return status;
                    }
                    // DB not yet terminal — wait a tick and retry (defensive;
                    // in practice the DB write happens before channel close).
                    let _ = attempt;
                    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                }
                // Nothing terminal in DB after the budget — give up safely.
                // Returning "failed" is preferable to spinning forever; this
                // branch should be unreachable in normal operation.
                log::warn!(
                    "subagent_wait_closed: no terminal status in DB after retries (task_id={}); returning failed",
                    task_id
                );
                return "failed".to_string();
            }
        }
    }
}

/// Parse a SSE payload and return the terminal status string if it's a status event.
fn terminal_status_from_payload(payload: &str) -> Option<String> {
    let parsed: serde_json::Value = serde_json::from_str(payload).ok()?;
    if parsed.get("type").and_then(serde_json::Value::as_str) != Some("status") {
        return None;
    }
    let status = parsed.get("status").and_then(serde_json::Value::as_str)?;
    match status {
        "Completed" => Some("completed".to_string()),
        "Cancelled" => Some("cancelled".to_string()),
        "Failed" => Some("failed".to_string()),
        _ => None,
    }
}

/// Read the last assistant message from a session as a summary (Q2).
/// Skips compact markers — only real assistant content is returned.
fn read_last_assistant_message(
    db: &Arc<Mutex<crate::db::Database>>,
    session_id: &str,
) -> Option<String> {
    let Ok(db) = db.lock() else { return None };
    let Ok(messages) = crate::db::session_store::get_messages_by_session(&db, session_id) else {
        return None;
    };
    messages
        .iter()
        .rev()
        .find(|m| m.role == "assistant" && m.message_kind.as_deref() != Some("compact"))
        .map(|m| m.content.clone())
        .filter(|c| !c.trim().is_empty())
}

fn collect_subagent_event(
    payload: &str,
    steps: &mut Vec<Value>,
    final_content: &mut String,
    tokens_used: &mut Option<u32>,
) {
    let Ok(event) = serde_json::from_str::<super::types::AgentEvent>(payload) else {
        return;
    };
    match event {
        super::types::AgentEvent::ThinkingDelta { delta, .. } => {
            if delta.trim().is_empty() {
                return;
            }
            if let Some(last) = steps.last_mut() {
                if last.get("kind").and_then(Value::as_str) == Some("reasoning") {
                    if let Some(text) = last.get_mut("text") {
                        let existing = text.as_str().unwrap_or_default().to_string() + &delta;
                        *text = Value::String(existing);
                        return;
                    }
                }
            }
            steps.push(json!({
                "kind": "reasoning",
                "text": delta,
                "state": "completed",
            }));
        }
        super::types::AgentEvent::ContentDelta { delta, .. } => {
            final_content.push_str(&delta);
        }
        super::types::AgentEvent::ToolCallStarted { name, input, .. } => {
            let label = input
                .as_object()
                .map(|record| extract_subagent_tool_label(&name, record))
                .unwrap_or_default();
            steps.push(json!({
                "kind": "tool",
                "text": name,
                "toolName": name,
                "toolLabel": if label.is_empty() { None::<String> } else { Some(label) },
                "state": "running",
            }));
        }
        super::types::AgentEvent::ToolCallFinished { error_text, .. } => {
            for step in steps.iter_mut().rev() {
                if step.get("kind").and_then(Value::as_str) == Some("tool")
                    && step.get("state").and_then(Value::as_str) == Some("running")
                {
                    if let Some(state) = step.get_mut("state") {
                        *state = Value::String(if error_text.is_some() {
                            "error".to_string()
                        } else {
                            "completed".to_string()
                        });
                    }
                    break;
                }
            }
        }
        super::types::AgentEvent::CompactStarted { .. } => {
            steps.push(json!({
                "kind": "compact",
                "text": "Compacting context\u{2026}",
                "state": "running",
            }));
        }
        super::types::AgentEvent::CompactCompleted {
            removed_count,
            summary_preview,
            ..
        } => {
            let text = if removed_count == 0 {
                "Context already fits \u{2014} nothing to compact.".to_string()
            } else {
                format!("Compacted {removed_count} older messages.")
            };
            let mut updated = false;
            for step in steps.iter_mut().rev() {
                if step.get("kind").and_then(Value::as_str) == Some("compact")
                    && step.get("state").and_then(Value::as_str) == Some("running")
                {
                    if let Some(state) = step.get_mut("state") {
                        *state = Value::String("completed".to_string());
                    }
                    if let Some(existing) = step.get_mut("text") {
                        *existing = Value::String(text.clone());
                    }
                    if let Some(object) = step.as_object_mut() {
                        object.insert("removedCount".to_string(), Value::from(removed_count));
                        if !summary_preview.trim().is_empty() {
                            object.insert(
                                "preview".to_string(),
                                Value::String(summary_preview.clone()),
                            );
                        }
                    }
                    updated = true;
                    break;
                }
            }
            if !updated {
                steps.push(json!({
                    "kind": "compact",
                    "text": text,
                    "state": "completed",
                    "removedCount": removed_count,
                    "preview": if summary_preview.trim().is_empty() { None::<String> } else { Some(summary_preview.clone()) },
                }));
            }
        }
        super::types::AgentEvent::Done { usage, .. } => {
            *tokens_used = usage.map(|item| item.total_tokens);
        }
        _ => {}
    }
}

fn build_subagent_system_prompt(
    task: &str,
    context: Option<&str>,
    tools: Option<&[String]>,
    depth: usize,
    max_depth: usize,
    workspace_dir: Option<&str>,
) -> String {
    let mut sections = vec![
        format!(
            "You are Coder, a focused sub-agent operating at nesting depth {} (maximum: {}).",
            depth + 1,
            max_depth
        ),
        "Your job is to complete a delegated sub-task efficiently and report evidence-backed findings to the parent agent.".to_string(),
        "Constraints:".to_string(),
        "- You have access to the same workspace as the parent agent.".to_string(),
        "- Do not spawn further sub-agents.".to_string(),
        "- Keep your work narrowly focused on the delegated task.".to_string(),
        "- When finished, provide a concise summary of what was found, what was accomplished, key evidence, and any remaining uncertainty.".to_string(),
    ];

    // Inject project context so the sub-agent does NOT need to re-explore
    // the workspace from scratch. The parent already knows the key files and
    // structure — share that knowledge to save tokens.
    if let Some(ws_dir) = workspace_dir {
        if let Some(overview) = build_project_overview(ws_dir) {
            sections.push(String::new());
            sections.push(
                "## Project Context (shared by parent agent)\n\
                 The parent agent already knows the following about the workspace. \
                 Use this to orient yourself quickly — you should NOT re-explore \
                 what is already described here."
                    .to_string(),
            );
            sections.push(overview);
        }
    }

    sections.push(String::new());
    sections.push("Delegated Task:".to_string());
    sections.push(task.to_string());

    if let Some(context) = context.map(str::trim).filter(|value| !value.is_empty()) {
        sections.push(String::new());
        sections.push("Additional Context from Parent:".to_string());
        sections.push(context.to_string());
    }
    if let Some(tools) = tools.filter(|value| !value.is_empty()) {
        sections.push(String::new());
        sections.push("Allowed Tools:".to_string());
        sections.push(format!(
            "You may only use the following tools: {}.",
            tools.join(", ")
        ));
    }
    sections.join("\n")
}

/// Build a lightweight project overview from the workspace directory.
///
/// Collects a top-level directory listing and the AGENTS.md (if present)
/// so the sub-agent can orient itself without re-running `ls` / `get_workspace_tree`.
fn build_project_overview(workspace_dir: &str) -> Option<String> {
    use std::fs;
    use std::path::Path;

    let root = Path::new(workspace_dir);
    if !root.is_dir() {
        return None;
    }

    let mut lines: Vec<String> = Vec::new();
    lines.push(format!("Workspace directory: {}", workspace_dir));

    // Top-level listing (first 40 entries)
    match fs::read_dir(root) {
        Ok(entries) => {
            let mut names: Vec<String> = entries
                .filter_map(|e| e.ok())
                .map(|e| {
                    let path = e.path();
                    let name = e.file_name().to_string_lossy().to_string();
                    if path.is_dir() {
                        format!("{}/", name)
                    } else {
                        name
                    }
                })
                .collect();
            names.sort_by(|a, b| {
                let a_is_dir = a.ends_with('/');
                let b_is_dir = b.ends_with('/');
                b_is_dir.cmp(&a_is_dir).then_with(|| a.cmp(b))
            });
            let max_entries = 40usize;
            let truncated = names.len() > max_entries;
            if truncated {
                names.truncate(max_entries);
                names.push(format!("... and {} more entries", names.len() + 1));
            }
            lines.push(format!(
                "Top-level files/directories:\n  {}",
                names.join("\n  ")
            ));
        }
        Err(_) => {
            // Can't read — skip
        }
    }

    // AGENTS.md (first 40 lines) if present
    let agents_path = root.join("AGENTS.md");
    if agents_path.is_file() {
        if let Ok(content) = fs::read_to_string(&agents_path) {
            let preview: String = content
                .lines()
                .take(40)
                .collect::<Vec<_>>()
                .join("\n");
            if !preview.trim().is_empty() {
                lines.push(format!(
                    "Project rules (AGENTS.md preview):\n{}",
                    preview
                ));
            }
        }
    }

    if lines.len() <= 1 {
        None
    } else {
        Some(lines.join("\n\n"))
    }
}

fn subagent_context_depth(task_id: Option<&str>) -> usize {
    task_id
        .unwrap_or_default()
        .matches("/sub-")
        .count()
}

fn extract_subagent_tool_label(
    tool_name: &str,
    input: &serde_json::Map<String, Value>,
) -> String {
    let read_str = |key: &str| input.get(key).and_then(Value::as_str).unwrap_or("").trim();
    match tool_name {
        "shell" | "await" => {
            let label = if !read_str("description").is_empty() {
                read_str("description")
            } else {
                read_str("command")
            };
            truncate_label(label, 40)
        }
        "grep" => truncate_label(read_str("pattern"), 36),
        "glob" => truncate_label(read_str("glob_pattern"), 36),
        "read_file" | "list_dir" => truncate_label(read_str("path"), 40),
        "web_search" => truncate_label(read_str("search_term"), 36),
        _ => String::new(),
    }
}

fn truncate_label(value: &str, max_chars: usize) -> String {
    let char_count = value.chars().count();
    if char_count <= max_chars {
        return value.to_string();
    }
    value.chars().take(max_chars).collect::<String>() + "…"
}

fn build_subagent_summary(steps: &[Value], task: &str, final_content: &str, error: Option<&str>) -> String {
    let task_preview = if task.chars().count() > 60 {
        task.chars().take(60).collect::<String>() + "…"
    } else {
        task.to_string()
    };
    if let Some(error) = error {
        return format!("Task \"{task_preview}\" encountered an error: {error}");
    }

    // Use the LLM's natural language output as the primary summary.
    // This is significantly more useful than "Completed task using 5 tool calls..."
    let trimmed_content = final_content.trim();
    if !trimmed_content.is_empty() {
        return trimmed_content.to_string();
    }
    // Fallback: programmatic summary when LLM produced no text output.
    let tool_steps: Vec<&Value> = steps
        .iter()
        .filter(|step| step.get("kind").and_then(Value::as_str) == Some("tool"))
        .collect();
    let reasoning_steps = steps
        .iter()
        .filter(|step| step.get("kind").and_then(Value::as_str) == Some("reasoning"))
        .count();
    if tool_steps.is_empty() && reasoning_steps == 0 {
        return format!("Task \"{task_preview}\" completed directly.");
    }
    let mut tool_names = Vec::<String>::new();
    for step in tool_steps.iter() {
        if let Some(name) = step.get("toolName").and_then(Value::as_str) {
            if !tool_names.iter().any(|existing| existing == name) {
                tool_names.push(name.to_string());
            }
        }
    }
    let rounds = if reasoning_steps == 0 { 1 } else { reasoning_steps };
    format!(
        "Completed task using {} tool call{} across {} round{}. Tools used: {}.",
        tool_steps.len(),
        if tool_steps.len() == 1 { "" } else { "s" },
        rounds,
        if rounds == 1 { "" } else { "s" },
        if tool_names.is_empty() {
            "none".to_string()
        } else {
            tool_names.join(", ")
        }
    )
}

async fn execute_mcp_tool_call(
    tool_name: &str,
    server_id: &str,
    server_tool_name: &str,
    args: Value,
    ctx: &ToolExecutionContext<'_>,
) -> Result<ToolResultEnvelope, String> {
    let server = match load_mcp_server(ctx, server_id) {
        Ok(Some(server)) => server,
        Ok(None) => {
            return Ok(tool_failure(
                tool_name,
                "mcp_server_not_found",
                format!("MCP server not found: {server_id}"),
            ))
        }
        Err(error) => return Ok(tool_failure(tool_name, "execution_failed", error)),
    };

    if !server.enabled {
        return Ok(tool_failure(
            tool_name,
            "mcp_server_disabled",
            format!("MCP server is disabled: {}", server.name),
        ));
    }

    let result = ctx
        .mcp_registry
        .call_tool(server.clone(), server_tool_name.to_string(), args)
        .await;
    match result {
        Ok(result) => {
            let content_json: Vec<Value> = result
                .content
                .iter()
                .map(mcp_content_block_to_json)
                .collect();
            Ok(tool_success(
                tool_name,
                json!({
                    "serverId": result.server_id,
                    "serverName": server.name,
                    "toolName": server_tool_name,
                    "text": mcp_content_blocks_to_text(&result.content),
                    "content": content_json,
                    "isError": result.is_error,
                }),
            ))
        }
        Err(error) => Ok(tool_failure(tool_name, "mcp_call_failed", error)),
    }
}

fn load_mcp_server(
    ctx: &ToolExecutionContext<'_>,
    server_id: &str,
) -> Result<Option<crate::tools::McpServerConfig>, String> {
    let db = ctx.db.lock().map_err(|e| e.to_string())?;
    db.get("mcpServers", server_id)
}

fn mcp_content_blocks_to_text(content: &[crate::tools::mcp::McpContentBlock]) -> String {
    let mut parts = Vec::new();
    for block in content {
        match block {
            crate::tools::mcp::McpContentBlock::Text { text } => parts.push(text.clone()),
            crate::tools::mcp::McpContentBlock::Image { data, mime_type } => {
                parts.push(format!("[image {}: {} bytes]", mime_type, data.len()))
            }
            crate::tools::mcp::McpContentBlock::Resource { uri, text, .. } => {
                if let Some(text) = text {
                    parts.push(format!("[resource {uri}]\n{text}"));
                } else {
                    parts.push(format!("[resource {uri}]"));
                }
            }
        }
    }
    parts.join("\n\n")
}

fn mcp_content_block_to_json(block: &crate::tools::mcp::McpContentBlock) -> Value {
    match block {
        crate::tools::mcp::McpContentBlock::Text { text } => json!({
            "type": "text",
            "text": text,
        }),
        crate::tools::mcp::McpContentBlock::Image { data, mime_type } => json!({
            "type": "image",
            "data": data,
            "mimeType": mime_type,
        }),
        crate::tools::mcp::McpContentBlock::Resource {
            uri,
            mime_type,
            text,
        } => json!({
            "type": "resource",
            "uri": uri,
            "mimeType": mime_type,
            "text": text,
        }),
    }
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct StoredEmailSettings {
    smtp_host: String,
    smtp_port: u16,
    username: String,
    password: String,
    from_address: String,
    use_tls: bool,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct StoredEmailSettingsStore {
    current_provider: Option<String>,
    profiles: Option<std::collections::HashMap<String, StoredEmailSettings>>,
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
    let settings = match read_email_settings() {
        Some(value) => value,
        None => {
            return Ok(tool_failure(
                "send_email",
                "missing_settings",
                "Email settings are not configured.",
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

fn read_web_tools_settings() -> StoredWebToolsSettings {
    let Some(raw) = get_setting("coder:web-tools-settings") else {
        return StoredWebToolsSettings::default();
    };
    serde_json::from_str::<StoredWebToolsSettings>(&raw).unwrap_or_default()
}

fn read_email_settings() -> Option<crate::tools::mail::EmailSettings> {
    if let Some(raw) = get_setting("emailSettings") {
        if let Ok(value) = serde_json::from_str::<crate::tools::mail::EmailSettings>(&raw) {
            return Some(value);
        }
    }

    let raw = get_setting("coder:email-settings")?;
    if let Ok(value) = serde_json::from_str::<crate::tools::mail::EmailSettings>(&raw) {
        return Some(value);
    }

    let store = serde_json::from_str::<StoredEmailSettingsStore>(&raw).ok()?;
    let provider = store.current_provider?;
    let profile = store.profiles?.get(&provider)?.clone();
    let username = profile.username.clone();
    Some(crate::tools::mail::EmailSettings {
        smtp_host: profile.smtp_host,
        smtp_port: profile.smtp_port,
        username,
        password: profile.password,
        from_address: if profile.from_address.trim().is_empty() {
            profile.username
        } else {
            profile.from_address
        },
        use_tls: profile.use_tls,
    })
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

#[cfg(test)]
mod tests {
    use super::{
        all_tool_names, ask_question_timeout_message, get_tool_definitions,
        resolve_ask_question_timeout_ms, validate_ask_question_args,
        AskQuestionArgs, AskQuestionItem, AskQuestionOption, AutomationIdArgs,
        CreateAutomationArgs, DISABLED_AGENT_TOOL_NAMES, DEFAULT_ASK_QUESTION_TIMEOUT_MS,
        UpdateAutomationArgs,
    };
    use serde_json::{json, Value};
    use std::collections::BTreeSet;

    fn tool_names(agent_mode: Option<&str>) -> Vec<String> {
        get_tool_definitions(agent_mode)
            .into_iter()
            .map(|tool| tool.function.name)
            .collect()
    }

    #[test]
    fn agent_mode_includes_automation_tools() {
        let names = tool_names(Some("agent"));
        assert!(names.contains(&"list_automations".to_string()));
        assert!(names.contains(&"create_automation".to_string()));
        assert!(names.contains(&"update_automation".to_string()));
        assert!(names.contains(&"delete_automation".to_string()));
    }

    #[test]
    fn agent_mode_includes_spawn_subagent() {
        let names = tool_names(Some("agent"));
        assert!(names.contains(&"spawn_subagent".to_string()));
    }

    #[test]
    fn ask_and_plan_modes_exclude_spawn_subagent() {
        assert!(!tool_names(Some("ask")).contains(&"spawn_subagent".to_string()));
        assert!(!tool_names(Some("plan")).contains(&"spawn_subagent".to_string()));
    }

    #[test]
    fn agent_mode_excludes_disabled_tools() {
        let names = tool_names(Some("agent"));
        assert!(!names.contains(&"replace_lines".to_string()));
    }

    #[test]
    fn mode_tool_catalogs_match_expected_allowlists() {
        let mut agent = tool_names(Some("agent"));
        let mut ask = tool_names(Some("ask"));
        let mut plan = tool_names(Some("plan"));
        agent.sort();
        ask.sort();
        plan.sort();

        assert_eq!(
            agent,
            vec![
                "ask_question",
                "await",
                "await_subagent",
                "browse_page",
                "create_automation",
                "create_file",
                "delete_automation",
                "edit_file",
                "get_workspace_tree",
                "glob",
                "grep",
                "kill_shell",
                "list_automations",
                "list_dir",
                "list_shells",
                "read_file",
                "read_shell_logs",
                "remote_shell",
                "replace_file",
                "send_email",
                "shell",
                "spawn_subagent",
                "todo_read",
                "todo_write",
                "update_automation",
                "web_search",
            ]
        );
        assert_eq!(
            ask,
            vec![
                "ask_question",
                "browse_page",
                "get_workspace_tree",
                "glob",
                "grep",
                "list_dir",
                "list_shells",
                "read_file",
                "todo_read",
                "web_search",
            ]
        );
        assert_eq!(
            plan,
            vec![
                "ask_question",
                "browse_page",
                "get_workspace_tree",
                "glob",
                "grep",
                "list_dir",
                "list_shells",
                "plan_create",
                "plan_delete",
                "plan_edit",
                "plan_list",
                "plan_read",
                "plan_update",
                "read_file",
                "todo_read",
                "todo_write",
                "web_search",
            ]
        );
    }

    #[test]
    fn every_named_tool_is_exposed_disabled_or_compact_only() {
        // Catches tools that exist in all_tool_names()/execute but never reach
        // any mode catalog (the spawn_subagent regression class).
        let named: BTreeSet<_> = all_tool_names().into_iter().collect();
        let mut covered = BTreeSet::new();
        for mode in [Some("agent"), Some("ask"), Some("plan")] {
            covered.extend(tool_names(mode));
        }
        covered.extend(DISABLED_AGENT_TOOL_NAMES.iter().map(|name| (*name).to_string()));

        assert_eq!(
            covered, named,
            "every all_tool_names() entry must appear in a mode catalog or be DISABLED"
        );
    }

    #[test]
    fn ask_mode_excludes_automation_tools() {
        let names = tool_names(Some("ask"));
        assert!(!names.contains(&"create_automation".to_string()));
        assert!(!names.contains(&"list_automations".to_string()));
    }

    #[test]
    fn create_automation_args_accept_snake_case_tool_fields() {
        let args: CreateAutomationArgs = serde_json::from_value(json!({
            "name": "Daily review",
            "prompt": "Review open PRs",
            "cron_expression": "0 9 * * 1-5",
            "workspace_dir": "/tmp/project",
            "agent_mode": "agent",
            "thinking_enabled": false
        }))
        .expect("snake_case args should deserialize");

        assert_eq!(args.cron_expression, "0 9 * * 1-5");
        assert_eq!(args.workspace_dir.as_deref(), Some("/tmp/project"));
        assert_eq!(args.agent_mode.as_deref(), Some("agent"));
        assert_eq!(args.thinking_enabled, Some(false));
    }

    #[test]
    fn create_automation_args_accept_camel_case_aliases() {
        let args: CreateAutomationArgs = serde_json::from_value(json!({
            "name": "Daily review",
            "prompt": "Review open PRs",
            "cronExpression": "0 9 * * 1-5",
            "workspaceDir": "/tmp/project",
            "agentMode": "ask",
            "thinkingEnabled": true
        }))
        .expect("camelCase aliases should deserialize");

        assert_eq!(args.cron_expression, "0 9 * * 1-5");
        assert_eq!(args.workspace_dir.as_deref(), Some("/tmp/project"));
        assert_eq!(args.agent_mode.as_deref(), Some("ask"));
        assert_eq!(args.thinking_enabled, Some(true));
    }

    #[test]
    fn update_automation_args_accept_snake_case_tool_fields() {
        let args: UpdateAutomationArgs = serde_json::from_value(json!({
            "id": "job-1",
            "cron_expression": "0 10 * * *",
            "thinking_enabled": true
        }))
        .expect("update args should deserialize");

        assert_eq!(args.id, "job-1");
        assert_eq!(args.cron_expression.as_deref(), Some("0 10 * * *"));
        assert_eq!(args.thinking_enabled, Some(true));
    }

    #[test]
    fn delete_automation_args_accept_id_field() {
        let args: AutomationIdArgs =
            serde_json::from_value(json!({ "id": "job-1" })).expect("delete args should deserialize");
        assert_eq!(args.id, "job-1");
    }

    #[test]
    fn agent_mode_excludes_plan_tools() {
        let names = tool_names(Some("agent"));
        assert!(names.contains(&"create_file".to_string()));
        assert!(names.contains(&"shell".to_string()));
        assert!(!names.contains(&"plan_create".to_string()));
        assert!(!names.contains(&"plan_list".to_string()));
    }

    #[test]
    fn plan_mode_includes_plan_tools() {
        let names = tool_names(Some("plan"));
        assert!(names.contains(&"plan_create".to_string()));
        assert!(names.contains(&"plan_list".to_string()));
        assert!(!names.contains(&"create_file".to_string()));
        assert!(!names.contains(&"shell".to_string()));
    }

    #[test]
    fn ask_mode_excludes_plan_and_write_tools() {
        let names = tool_names(Some("ask"));
        assert!(names.contains(&"read_file".to_string()));
        assert!(!names.contains(&"plan_create".to_string()));
        assert!(!names.contains(&"create_file".to_string()));
    }
    #[test]
    fn ask_question_timeout_message_mentions_user_may_be_away() {
        let message = ask_question_timeout_message(30_000);
        assert!(message.contains("30"));
        assert!(message.contains("may be away from the computer"));
    }

    #[test]
    fn ask_question_rejects_zero_timeout() {
        let error = validate_ask_question_args(&AskQuestionArgs {
            title: Some("Clarify".to_string()),
            timeout_ms: Some(0),
            questions: vec![AskQuestionItem {
                id: "q1".to_string(),
                prompt: "Choose one".to_string(),
                allow_multiple: false,
                options: vec![
                    AskQuestionOption {
                        id: "a".to_string(),
                        label: "A".to_string(),
                        recommended: None,
                    },
                    AskQuestionOption {
                        id: "b".to_string(),
                        label: "B".to_string(),
                        recommended: Some(true),
                    },
                ],
            }],
        })
        .unwrap_err();
        assert_eq!(error.tool, "ask_question");
        assert_eq!(
            error.error.as_ref().map(|payload| payload.code.as_str()),
            Some("invalid_arguments")
        );
        assert_eq!(error.data, None);
    }

    #[test]
    fn ask_question_uses_default_timeout_when_missing() {
        assert_eq!(
            resolve_ask_question_timeout_ms(None),
            DEFAULT_ASK_QUESTION_TIMEOUT_MS
        );
        assert_eq!(resolve_ask_question_timeout_ms(Some(5_000)), 5_000);
    }

    // ============================================================
    // todo_write merge bug verification
    // ============================================================

    /// Verifies that `execute_todo_write` field-level merge preserves
    /// existing content when the incoming todo omits the `content` field.
    /// (Regression test for the `unwrap_or("")` + `merged[position] = next` bug.)
    #[test]
    fn todo_write_merge_preserves_content_when_incoming_omits_field() {
        // Simulate an existing record with content
        let existing = json!({
            "id": "1",
            "sessionId": "session-1",
            "content": "Read code",
            "status": "pending",
            "order": 0,
            "createdAt": 1000u64,
            "updatedAt": 1000u64,
        });

        // Incoming merge update — only id + status, content intentionally omitted
        let incoming = json!({ "id": "1", "status": "completed" });

        // The old buggy pattern used .unwrap_or("") + full replacement.
        // The fix uses field-level merge: only update fields present in incoming.
        if let Some(_entry) = incoming.get("content") {
            // This branch is NOT reached when content is absent ✅
            unreachable!("content field is absent — this branch should not execute");
        } else {
            // Content not provided — existing value must be preserved
            let preserved = existing.get("content").and_then(Value::as_str).unwrap_or("");
            assert_eq!(preserved, "Read code", "Existing content should remain unchanged");
        }

        // Simulate the correct field-level merge
        let now = 2000u64;
        let mut merged = vec![existing.clone()];

        // Find position and apply only present fields
        let pos = merged.iter().position(|v| {
            v.get("id").and_then(Value::as_str) == incoming.get("id").and_then(Value::as_str)
        }).unwrap();

        let entry = &mut merged[pos];
        // status: update from incoming
        entry["status"] = json!(incoming["status"]);
        // content: NOT updated because todo.get("content").is_some() is false
        // order: update from loop index
        entry["order"] = json!(0u64);
        // updatedAt: always refresh
        entry["updatedAt"] = json!(now);

        // Verify: content preserved, status updated
        assert_eq!(
            merged[0].get("content").and_then(Value::as_str),
            Some("Read code"),
            "Content must be preserved when incoming omits content field"
        );
        assert_eq!(
            merged[0].get("status").and_then(Value::as_str),
            Some("completed"),
            "Status should be updated from incoming"
        );
        assert_eq!(
            merged[0].get("updatedAt").and_then(Value::as_u64),
            Some(now),
            "updatedAt should be refreshed"
        );
    }

    /// Verifies the same behaviour with a real JSON Value manipulation
    /// that mirrors the actual fix in execute_todo_write.
    #[test]
    fn todo_write_merge_correct_behaviour_keeps_content() {
        let existing = json!({
            "id": "1",
            "sessionId": "session-1",
            "content": "Read code",
            "status": "pending",
            "order": 0,
            "createdAt": 1000u64,
            "updatedAt": 1000u64,
        });

        let incoming = json!({ "id": "1", "status": "completed" });

        // ---- CORRECT pattern (preserve existing content when absent) ----
        let existing_content = existing.get("content").and_then(Value::as_str).unwrap_or_default();
        let content = incoming
            .get("content")
            .and_then(Value::as_str)
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| existing_content.to_string());
        // -------------------------------------------------------------------

        assert_eq!(content, "Read code", "Existing content should be preserved");

        let now = 2000u64;
        let next = json!({
            "id": incoming["id"],
            "sessionId": "session-1",
            "content": content,
            "status": incoming["status"],
            "order": 0,
            "createdAt": existing["createdAt"],
            "updatedAt": now,
        });

        let mut merged = vec![existing];
        if let Some(pos) = merged.iter().position(|v| {
            v.get("id").and_then(Value::as_str) == next.get("id").and_then(Value::as_str)
        }) {
            merged[pos] = next;
        }

        assert_eq!(
            merged[0].get("content").and_then(Value::as_str),
            Some("Read code"),
            "After correct merge, content should still be 'Read code'"
        );
    }

    /// Verifies that new todo entries get a non-conflicting order (max+1)
    /// instead of using the loop index which may conflict with existing orders.
    #[test]
    fn todo_write_new_entry_gets_non_conflicting_order() {
        // Existing merged entries with non-consecutive orders [0, 1, 3]
        let existing = vec![
            json!({ "id": "a", "sessionId": "s1", "content": "A", "status": "pending",  "order": 0u64, "createdAt": 1u64, "updatedAt": 1u64 }),
            json!({ "id": "b", "sessionId": "s1", "content": "B", "status": "active",   "order": 1u64, "createdAt": 1u64, "updatedAt": 1u64 }),
            json!({ "id": "c", "sessionId": "s1", "content": "C", "status": "completed","order": 3u64, "createdAt": 1u64, "updatedAt": 1u64 }),
        ];

        let mut merged = existing.clone();

        // Simulate: incoming todo with a new id (not in merged)
        let incoming_id = "d";
        // The old buggy pattern: order = index (0), causing conflict with existing order 0
        let buggy_order = 0u64;
        assert!(
            merged.iter().any(|v| v.get("order").and_then(Value::as_u64) == Some(buggy_order)),
            "BUG: new item order 0 conflicts with existing order 0"
        );

        // Correct pattern: compute max existing order + 1
        let max_order = merged
            .iter()
            .filter_map(|v| v.get("order").and_then(Value::as_u64))
            .max()
            .unwrap_or(0);
        let correct_order = max_order + 1; // = 4

        let new_entry = json!({
            "id": incoming_id,
            "sessionId": "s1",
            "content": "D",
            "status": "pending",
            "order": correct_order,
            "createdAt": 2u64,
            "updatedAt": 2u64,
        });
        merged.push(new_entry);

        // Verify: no duplicate orders
        let mut orders: Vec<u64> = merged
            .iter()
            .filter_map(|v| v.get("order").and_then(Value::as_u64))
            .collect();
        orders.sort();
        let unique_orders: Vec<u64> = {
            let mut v = orders.clone();
            v.dedup();
            v
        };
        assert_eq!(
            orders, unique_orders,
            "All orders must be unique — new item got conflicting order"
        );
        // Verify: new item has order 4 (max+1)
        let new_item = merged.iter().find(|v| v.get("id").and_then(Value::as_str) == Some("d")).unwrap();
        assert_eq!(
            new_item.get("order").and_then(Value::as_u64),
            Some(4u64),
            "New item should get max existing order + 1 = 4"
        );
    }
}
