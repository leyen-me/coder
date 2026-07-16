//! Embeddable HTTP server entry points shared by the CLI binary and the Tauri shell.

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use tokio::sync::oneshot;

use crate::{cleanup_background_shells, initialize_app_state, AppState};

const WORKSPACE_SETTING_KEY: &str = "coder:workspace-dir";

/// Options for starting the embedded HTTP server.
#[derive(Debug, Clone, Default)]
pub struct ServerOptions {
    /// Listen port. `None` uses the build-mode default (1421 in debug, 0/random in release).
    pub port: Option<u16>,
    /// Bind loopback only when true (desktop shell). CLI binds `0.0.0.0` for LAN access.
    pub loopback_only: bool,
    /// Optional workspace override. When `None`, reads the persisted setting or `~/.coder`.
    pub workspace_dir: Option<PathBuf>,
}

/// Handle returned after the server has bound and is serving.
pub struct RunningServer {
    pub state: Arc<AppState>,
    pub port: u16,
    pub local_url: String,
    shutdown_tx: Option<oneshot::Sender<()>>,
    join_handle: Option<tokio::task::JoinHandle<Result<(), std::io::Error>>>,
}

impl RunningServer {
    /// Request a graceful shutdown and wait for the serve task to finish.
    pub async fn shutdown(mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
        cleanup_background_shells(&self.state);
        if let Some(handle) = self.join_handle.take() {
            let _ = handle.await;
        }
    }

    /// Fire-and-forget shutdown signal (e.g. from a sync exit hook).
    pub fn request_shutdown(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
        cleanup_background_shells(&self.state);
    }
}

impl Drop for RunningServer {
    fn drop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
        cleanup_background_shells(&self.state);
    }
}

fn default_port() -> u16 {
    #[cfg(debug_assertions)]
    {
        1421
    }
    #[cfg(not(debug_assertions))]
    {
        0
    }
}

fn resolve_workspace_dir(override_dir: Option<PathBuf>) -> PathBuf {
    if let Some(dir) = override_dir {
        return dir;
    }
    crate::http::routes_settings::get_setting(WORKSPACE_SETTING_KEY)
        .map(PathBuf::from)
        .unwrap_or_else(crate::get_coder_data_dir)
}

/// Bind the listener, initialize app state, and spawn the axum server.
///
/// Returns once the socket is listening. Call [`RunningServer::shutdown`] on exit.
pub async fn start_server(opts: ServerOptions) -> Result<RunningServer, String> {
    let workspace_dir = resolve_workspace_dir(opts.workspace_dir);
    let port = opts.port.unwrap_or_else(default_port);
    let addr = if opts.loopback_only {
        SocketAddr::from(([127, 0, 0, 1], port))
    } else {
        SocketAddr::from(([0, 0, 0, 0], port))
    };

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|error| format!("Failed to bind {addr}: {error}"))?;

    let actual_port = listener
        .local_addr()
        .map_err(|error| format!("Failed to read bound address: {error}"))?
        .port();

    let local_url = format!("http://127.0.0.1:{actual_port}");
    let state = initialize_app_state(&workspace_dir, local_url.clone());
    crate::scheduled_jobs::spawn_scheduler(state.clone());

    let app = crate::http::build_router(state.clone());
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

    let join_handle = tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(async {
                shutdown_rx.await.ok();
            })
            .await
    });

    Ok(RunningServer {
        state,
        port: actual_port,
        local_url,
        shutdown_tx: Some(shutdown_tx),
        join_handle: Some(join_handle),
    })
}
