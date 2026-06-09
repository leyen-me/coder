mod agent;
mod tools;
mod window_chrome;

use std::sync::{Arc, Mutex};

use agent::registry::AgentRegistry;
use agent::{
    agent_cancel, agent_generate_session_title, agent_get_status, agent_start, AgentState,
};
use tauri::Manager;
use tools::{
    agent_get_runtime_environment, git_checkout_branch, git_get_current_branch, git_list_branches,
    pty_close, pty_create, pty_resize, pty_write, shell_kill, shell_kill_by_task, shell_list,
    tool_await, tool_edit_file, tool_glob, tool_grep, tool_list_dir, tool_read_file,
    tool_replace_file, tool_shell, tool_write_file, PtyRegistry, PtyState, ShellRegistry,
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
            tool_write_file,
            tool_replace_file,
            tool_edit_file,
            tool_glob,
            tool_grep,
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
