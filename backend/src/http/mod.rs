pub mod routes_tool;
pub mod routes_db;
pub mod routes_skills;
pub mod routes_settings;
pub mod routes_sse;
pub mod routes_mcp;
pub mod static_files;

use axum::{
    body::DefaultBodyLimit,
    routing::{get, post},
    Router,
};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};

use crate::AppState;

pub fn build_router(state: Arc<AppState>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        // ── Tool endpoints (canonical paths) ──────────────────────────────
        .route("/api/list_dir", post(routes_tool::handle_list_dir))
        .route("/api/read_file", post(routes_tool::handle_read_file))
        .route("/api/write_file", post(routes_tool::handle_write_file))
        .route("/api/edit_file", post(routes_tool::handle_edit_file))
        .route("/api/replace_lines", post(routes_tool::handle_replace_lines))
        .route("/api/replace_file", post(routes_tool::handle_replace_file))
        .route("/api/glob", post(routes_tool::handle_glob))
        .route("/api/grep", post(routes_tool::handle_grep))
        .route("/api/shell", post(routes_tool::handle_shell))
        .route("/api/remote_shell", post(routes_tool::handle_remote_shell))
        .route("/api/await_shell", post(routes_tool::handle_await_shell))
        .route("/api/list_shells", post(routes_tool::handle_list_shells))
        .route("/api/kill_shell", post(routes_tool::handle_kill_shell))
        .route("/api/kill_shell_by_task", post(routes_tool::handle_kill_shell_by_task))
        .route("/api/read_shell_logs", post(routes_tool::handle_read_shell_logs))
        .route("/api/web_search", post(routes_tool::handle_web_search))
        .route("/api/browse_page", post(routes_tool::handle_browse_page))
        .route("/api/get_workspace_tree", post(routes_tool::handle_workspace_tree))
        .route("/api/search_workspace_paths", post(routes_tool::handle_search_workspace_paths))
        .route("/api/normalize_external_path", post(routes_tool::handle_normalize_external_path))
        .route("/api/resolve_absolute_path", post(routes_tool::handle_resolve_absolute_path))
        .route("/api/read_local_image_bytes", post(routes_tool::handle_read_local_image_bytes))
        .route("/api/resolve_env_var", post(routes_tool::handle_resolve_env_var))
        .route("/api/runtime_environment", post(routes_tool::handle_runtime_environment))
        .route("/api/skills/catalog", post(routes_skills::handle_skills_catalog))
        .route("/api/skills/user_list", post(routes_skills::handle_user_skills))
        .route(
            "/api/skills/resolve_references",
            post(routes_skills::handle_resolve_skill_references),
        )
        .route("/api/skills/import", post(routes_skills::handle_import_skill))
        .route("/api/skills/delete", post(routes_skills::handle_delete_skill))
        .route("/api/test_remote_connection", post(routes_tool::handle_test_remote_connection))
        .route("/api/mcp/list_tools", post(routes_mcp::handle_mcp_list_tools))
        .route("/api/mcp/call_tool", post(routes_mcp::handle_mcp_call_tool))
        .route("/api/mcp/test_connection", post(routes_mcp::handle_mcp_test_connection))
        .route("/api/mcp/disconnect", post(routes_mcp::handle_mcp_disconnect))
        .route("/api/mcp/oauth/start", post(routes_mcp::handle_mcp_oauth_start))
        .route("/api/mcp/oauth/status", post(routes_mcp::handle_mcp_oauth_status))
        .route("/api/mcp/oauth/revoke", post(routes_mcp::handle_mcp_oauth_revoke))
        .route(
            "/api/mcp/oauth/callback",
            get(routes_mcp::handle_mcp_oauth_callback),
        )
        .route("/api/git_current_branch", post(routes_tool::handle_git_current_branch))
        .route("/api/handoff_git_snapshot", post(routes_tool::handle_handoff_git_snapshot))
        .route(
            "/api/validate_workspace_dir",
            post(routes_tool::handle_validate_workspace_dir),
        )
        .route(
            "/api/browse_directories",
            post(routes_tool::handle_browse_directories),
        )
        .route(
            "/api/agent_diagnostic_log",
            post(routes_tool::handle_agent_diagnostic_log),
        )
        .route(
            "/api/open_in_explorer",
            post(routes_tool::handle_open_in_explorer),
        )
        .route("/api/send_email", post(routes_tool::handle_send_email))
        .route("/api/server_info", get(routes_tool::handle_server_info))
        // ── Compat: `tool_` prefix (used by frontend agent tools) ────────
        .route("/api/tool_list_dir", post(routes_tool::handle_list_dir))
        .route("/api/tool_read_file", post(routes_tool::handle_read_file))
        .route("/api/tool_write_file", post(routes_tool::handle_write_file))
        .route("/api/tool_edit_file", post(routes_tool::handle_edit_file))
        .route("/api/tool_replace_lines", post(routes_tool::handle_replace_lines))
        .route("/api/tool_replace_file", post(routes_tool::handle_replace_file))
        .route("/api/tool_glob", post(routes_tool::handle_glob))
        .route("/api/tool_grep", post(routes_tool::handle_grep))
        .route("/api/tool_shell", post(routes_tool::handle_shell))
        .route("/api/tool_remote_shell", post(routes_tool::handle_remote_shell))
        .route("/api/tool_await", post(routes_tool::handle_await_shell))
        .route("/api/tool_browse_page", post(routes_tool::handle_browse_page))
        .route("/api/tool_get_workspace_tree", post(routes_tool::handle_workspace_tree))
        .route("/api/tool_web_search", post(routes_tool::handle_web_search))
        // ── Compat: `shell_*` prefix (used by frontend agent tools) ──────
        .route("/api/shell_list", post(routes_tool::handle_list_shells))
        .route("/api/shell_kill", post(routes_tool::handle_kill_shell))
        .route("/api/shell_kill_by_task", post(routes_tool::handle_kill_shell_by_task))
        .route("/api/shell_read_logs", post(routes_tool::handle_read_shell_logs))
        // ── Plan endpoints (canonical + tool_ compat) ────────────────────
        .route("/api/tool_plan_create", post(routes_tool::handle_plan_create))
        .route("/api/tool_plan_read", post(routes_tool::handle_plan_read))
        .route("/api/tool_plan_update", post(routes_tool::handle_plan_update))
        .route("/api/tool_plan_edit", post(routes_tool::handle_plan_edit))
        .route("/api/tool_plan_delete", post(routes_tool::handle_plan_delete))
        .route("/api/tool_plan_list", post(routes_tool::handle_plan_list))
        // Agent streaming
        .route("/agent/start", post(routes_tool::handle_agent_start))
        .route("/agent/cancel", post(routes_tool::handle_agent_cancel))
        .route("/agent/status", post(routes_tool::handle_agent_status))
        .route("/agent/generate_title", post(routes_tool::handle_generate_session_title))
        .route("/agent/refine_prompt", post(routes_tool::handle_refine_prompt))
        .route("/sse/events/{topic}", get(routes_sse::handle_sse_events))
        // Shell output SSE
        .route("/sse/shell/{shell_id}", get(routes_sse::handle_shell_sse))
        // Database
        .route("/db/get", post(routes_db::handle_db_get))
        .route("/db/get_all", post(routes_db::handle_db_get_all))
        .route("/db/put", post(routes_db::handle_db_put))
        .route("/db/delete", post(routes_db::handle_db_delete))
        .route("/db/get_all_from_index", post(routes_db::handle_db_get_all_from_index))
        .route("/db/count", post(routes_db::handle_db_count))
        .route("/db/clear", post(routes_db::handle_db_clear))
        // Settings
        .route("/settings/get", get(routes_settings::handle_settings_get))
        .route("/settings/set", post(routes_settings::handle_settings_set))
        .route("/settings/delete", post(routes_settings::handle_settings_delete))
        // Static files (React SPA) — fallback
        .fallback(static_files::handle_static_files)
        .layer(DefaultBodyLimit::disable())
        .layer(cors)
        .with_state(state)
}
