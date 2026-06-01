mod agent;
mod window_chrome;

use std::sync::Mutex;

use agent::{AgentState, agent_cancel, agent_get_status, agent_start};
use agent::registry::AgentRegistry;
use tauri::Manager;

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
        .manage(AgentState(
            Mutex::new(
                AgentRegistry::new().expect("failed to initialize agent registry"),
            ),
        ))
        .setup(|app| {
            configure_main_window(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            agent_start,
            agent_cancel,
            agent_get_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
