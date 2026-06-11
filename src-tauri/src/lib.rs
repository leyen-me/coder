mod agent;
mod shell_env;
mod tools;
mod window_chrome;

use std::sync::{Arc, Mutex};

use agent::registry::AgentRegistry;
use agent::{
    agent_cancel, agent_generate_session_title, agent_get_status, agent_start, AgentState,
};
use tauri::{Manager, RunEvent};
use tools::{
    agent_get_runtime_environment, git_checkout_branch, git_get_current_branch, git_list_branches,
    pty_close, pty_create, pty_resize, pty_write, shell_kill, shell_kill_by_task, shell_list,
    tool_await, tool_browse_page, tool_copy_path, tool_create_dir, tool_delete_path,
    tool_edit_file, tool_glob, tool_grep, tool_list_dir, tool_move_path, tool_read_editor_file,
    tool_read_file,
    tool_rename_path, tool_replace_file, tool_normalize_external_path, tool_read_local_image_bytes,
    tool_resolve_absolute_path, tool_shell,
    tool_search_workspace_paths, tool_web_search, tool_write_file,
    PtyRegistry, PtyState, ShellRegistry,
    ShellState,
};

const MAIN_WINDOW_LABEL: &str = "main";

fn configure_main_window(app: &tauri::App) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        log::warn!("main window not found; skipping window chrome setup");
        return;
    };

    window_chrome::apply(&window);
}

fn cleanup_background_shells(app: &tauri::AppHandle) {
    let state = app.state::<ShellState>();
    let Ok(mut registry) = state.0.lock() else {
        log::warn!("shell registry lock poisoned during app exit cleanup");
        return;
    };

    let killed = registry.kill_all_active();
    if killed > 0 {
        log::info!("Killed {killed} background shell process(es) on app exit");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AgentState(Arc::new(Mutex::new(
            AgentRegistry::new().expect("failed to initialize agent registry"),
        ))))
        .manage(ShellState(Arc::new(Mutex::new(ShellRegistry::new()))))
        .manage(PtyState(Arc::new(Mutex::new(PtyRegistry::new()))))
        .setup(|app| {
            shell_env::preload_shell_environment();
            configure_main_window(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            agent_start,
            agent_cancel,
            agent_get_status,
            agent_generate_session_title,
            tool_list_dir,
            tool_read_file,
            tool_read_editor_file,
            tool_write_file,
            tool_replace_file,
            tool_edit_file,
            tool_delete_path,
            tool_rename_path,
            tool_create_dir,
            tool_copy_path,
            tool_move_path,
            tool_normalize_external_path,
            tool_read_local_image_bytes,
            tool_resolve_absolute_path,
            tool_glob,
            tool_grep,
            tool_search_workspace_paths,
            tool_web_search,
            tool_browse_page,
            tool_shell,
            tool_await,
            shell_kill,
            shell_kill_by_task,
            shell_list,
            pty_create,
            pty_write,
            pty_resize,
            pty_close,
            agent_get_runtime_environment,
            git_list_branches,
            git_get_current_branch,
            git_checkout_branch,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                cleanup_background_shells(app_handle);
            }
        });
}
