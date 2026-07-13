//! Thin Tauri shell around the existing HTTP backend.
//!
//! The desktop app only owns window chrome. All product logic lives in
//! `coder_lib` and is reached over localhost HTTP / SSE.

mod window_chrome;

use std::sync::Mutex;

use coder_lib::server::{start_server, RunningServer, ServerOptions};
use tauri::Manager;
use tauri::RunEvent;

const MAIN_WINDOW_LABEL: &str = "main";

struct DesktopState {
    server: Mutex<Option<RunningServer>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .try_init()
        .ok();

    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();

            tauri::async_runtime::block_on(async move {
                let server = start_server(ServerOptions {
                    // Dev: share the Vite proxy port convention (1421).
                    // Release: bind an ephemeral port to avoid collisions.
                    port: if cfg!(debug_assertions) {
                        Some(1421)
                    } else {
                        Some(0)
                    },
                    loopback_only: true,
                    workspace_dir: None,
                })
                .await
                .map_err(|error| {
                    log::error!("failed to start embedded HTTP server: {error}");
                    error
                })?;

                let backend_url = format!("{}/", server.local_url);
                log::info!("desktop shell HTTP backend at {backend_url}");

                let window = handle
                    .get_webview_window(MAIN_WINDOW_LABEL)
                    .ok_or_else(|| "main window not found".to_string())?;

                // In dev, prefer the Vite HMR server; API calls still proxy to 1421.
                // In release, the backend serves the embedded SPA.
                let navigate_url = if cfg!(debug_assertions) {
                    "http://localhost:1420/".to_string()
                } else {
                    backend_url
                };

                let parsed = url::Url::parse(&navigate_url).map_err(|error| error.to_string())?;
                window
                    .navigate(parsed)
                    .map_err(|error| error.to_string())?;

                window_chrome::apply_to_window(&handle, MAIN_WINDOW_LABEL);
                let _ = window.show();

                handle.manage(DesktopState {
                    server: Mutex::new(Some(server)),
                });

                Ok::<(), String>(())
            })?;

            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<DesktopState>() {
                    if let Ok(mut guard) = state.server.lock() {
                        if let Some(mut server) = guard.take() {
                            server.request_shutdown();
                        }
                    }
                }
            }
        });
}
