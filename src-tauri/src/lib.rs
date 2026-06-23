mod agent;
mod file_watcher;
mod shell_env;
mod tools;
mod window_chrome;

use std::path::Path;
use std::sync::{Arc, Mutex};

use agent::registry::AgentRegistry;
use agent::{
    agent_cancel, agent_generate_session_title, agent_get_status, agent_refine_prompt,
    agent_start, AgentState,
};
use file_watcher::WorkspaceWatcher;
use tauri::{Manager, RunEvent};
pub struct FileWatcherState(pub Arc<Mutex<Option<WorkspaceWatcher>>>);
use tools::{
    agent_get_runtime_environment,
    git_ahead_behind, git_checkout_branch, git_commit, git_create_branch, git_delete_branch,
    git_delete_branch_force, git_diff, git_discard_all, git_discard_files, git_fetch,
    git_get_current_branch, git_get_remote_url, git_init, git_list_branches, git_log, git_pull,
    git_push, git_revert, git_stage_all, git_stage_files, git_status, git_unstage_all, git_unstage_files,
    preload_languages, pty_close, pty_create, pty_resize, pty_write, resolve_env_var, send_email, shell_kill, shell_kill_by_task, shell_list, shell_read_logs,
    test_remote_connection, tool_await, tool_browse_page, tool_copy_path, tool_create_dir, tool_delete_path,
    tool_edit_file, tool_get_workspace_tree, tool_glob, tool_grep, tool_list_dir,     tool_move_path, tool_read_editor_file,
    tool_plan_create, tool_plan_delete, tool_plan_edit, tool_plan_list, tool_plan_read, tool_plan_update,
    tool_read_file,
    tool_rename_path, tool_replace_file, tool_normalize_external_path, tool_read_local_image_bytes,
    tool_resolve_absolute_path, tool_shell,
    tool_search_workspace_paths, tool_web_search, tool_write_file,
    PageCache, PtyRegistry, PtyState, RemoteConnectionPool, ShellRegistry,
    ShellState,
};

const MAIN_WINDOW_LABEL: &str = "main";

fn configure_main_window(app: &tauri::App) {
    window_chrome::apply_to_window(app.handle(), MAIN_WINDOW_LABEL);
}

#[tauri::command]
async fn create_new_window(app: tauri::AppHandle, session_id: Option<String>) -> Result<(), String> {
    let label = format!("window-{}", uuid::Uuid::new_v4().to_string().replace('-', "_"));
    let url = match &session_id {
        Some(id) => format!("/chat/{id}").into(),
        None => "index.html".into(),
    };
    let window = tauri::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::App(url),
    )
    .title("coder")
    .inner_size(1600.0, 900.0)
    .decorations(false)
    .build()
    .map_err(|e| e.to_string())?;

    log::info!("Created new window with label: {label}, session_id: {session_id:?}");
    window.show().map_err(|e| e.to_string())?;
    std::mem::forget(window);
    Ok(())
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

fn cleanup_file_watcher(app: &tauri::AppHandle) {
    let state = app.state::<FileWatcherState>();
    let Ok(mut watcher) = state.0.lock() else {
        log::warn!("file watcher state lock poisoned during app exit cleanup");
        return;
    };
    if watcher.is_some() {
        *watcher = None;
        log::info!("file-watcher: stopped on app exit");
    }
}

#[tauri::command]
fn write_text_file(target_path: String, content: String) -> Result<(), String> {
    std::fs::write(&target_path, &content).map_err(|e| format!("Failed to write file: {e}"))
}

/// Tell the Rust back-end to watch `new_dir` for file changes.
///
/// If a different directory was already being watched, the old watcher is
/// dropped and a new one is started.  The front-end should invoke this
/// whenever the active workspace directory changes.
#[tauri::command]
fn set_workspace_dir(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, FileWatcherState>,
    new_dir: String,
) -> Result<(), String> {
    let dir_path = Path::new(&new_dir);
    if !dir_path.is_dir() {
        return Err(format!("Not a valid directory: {new_dir}"));
    }

    let mut guard = state.0.lock().map_err(|e| format!("Lock error: {e}"))?;

    match guard.as_mut() {
        Some(w) if w.dir() == dir_path => {
            // Already watching this directory – nothing to do.
            Ok(())
        }
        Some(w) => {
            // Switch to a different directory.
            w.restart(&app_handle, dir_path);
            log::info!("file-watcher: switched workspace dir to {new_dir}");
            Ok(())
        }
        None => {
            // First-time start.
            *guard = Some(WorkspaceWatcher::start(&app_handle, dir_path));
            log::info!("file-watcher: started watching {new_dir}");
            Ok(())
        }
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
        .manage(FileWatcherState(Arc::new(Mutex::new(None))))
        .manage(Arc::new(PageCache::new()))
        .manage(RemoteConnectionPool::new())
        .setup(|app| {
            shell_env::preload_shell_environment();
            preload_languages();
            configure_main_window(app);
            let pool = app.state::<RemoteConnectionPool>();
            pool.start_idle_reaper();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            agent_start,
            agent_cancel,
            agent_get_status,
            agent_generate_session_title,
            agent_refine_prompt,
            tool_list_dir,
            tool_get_workspace_tree,
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
            shell_read_logs,
            pty_create,
            pty_write,
            pty_resize,
            pty_close,
            agent_get_runtime_environment,
            resolve_env_var,
            tool_plan_create,
            tool_plan_read,
            tool_plan_update,
            tool_plan_edit,
            tool_plan_delete,
            tool_plan_list,
            git_ahead_behind,
            git_init,
            git_list_branches,
            git_get_current_branch,
            git_checkout_branch,
            git_status,
            git_stage_files,
            git_unstage_files,
            git_stage_all,
            git_unstage_all,
            git_discard_files,
            git_discard_all,
            git_commit,
            git_revert,
            git_log,
            git_diff,
            git_create_branch,
            git_delete_branch,
            git_delete_branch_force,
            git_push,
            git_pull,
            git_fetch,
            git_get_remote_url,
            send_email,
            write_text_file,
            set_workspace_dir,
            test_remote_connection,
            create_new_window,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                cleanup_background_shells(app_handle);
                cleanup_file_watcher(app_handle);
            }
        });
}
