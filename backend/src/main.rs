use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use clap::Parser;

#[derive(Parser)]
#[command(name = "coder", about = "Coder — AI-powered coding assistant")]
struct Cli {
    /// Port to listen on (default: 1421 in dev, random in release)
    #[arg(short, long)]
    port: Option<u16>,

    /// Working directory (default: current directory)
    #[arg(short, long)]
    workspace: Option<String>,

    /// Do not open browser automatically
    #[arg(long)]
    no_open: bool,
}

#[tokio::main]
async fn main() {
    // Initialize logging
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let cli = Cli::parse();

    // Determine workspace directory
    let workspace_dir = cli
        .workspace
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().expect("Failed to get current directory"));

    // Initialize all shared state
    let state = coder_lib::initialize_app_state(&workspace_dir);

    // Save the workspace directory to settings.json so the web frontend can read it.
    // This is the only way to set the workspace dir in browser mode (no native file dialog).
    let _ = coder_lib::http::routes_settings::set_setting(
        "coder:workspace-dir",
        &workspace_dir.to_string_lossy(),
    );

    // Determine port (default: 1421 for dev, 0 = random for release)
    #[cfg(debug_assertions)]
    let default_port = 1421;
    #[cfg(not(debug_assertions))]
    let default_port = 0;
    let port = cli.port.unwrap_or(default_port);
    let addr = SocketAddr::from(([127, 0, 0, 1], port));

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind address");

    let actual_port = listener.local_addr().unwrap().port();

    // Build the axum Router
    let app = coder_lib::http::build_router(state.clone());

    // Setup graceful shutdown
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let shutdown_tx = std::sync::Mutex::new(Some(shutdown_tx));

    let state_for_cleanup = state.clone();
    ctrlc::set_handler(move || {
        log::info!("Received Ctrl+C, shutting down...");
        coder_lib::cleanup_background_shells(&state_for_cleanup);
        if let Some(tx) = shutdown_tx.lock().unwrap().take() {
            let _ = tx.send(());
        }
    })
    .expect("Failed to set Ctrl+C handler");

    // Print URL and optionally open browser
    println!();
    println!("  Coder 服务已启动");
    println!("  http://127.0.0.1:{}", actual_port);
    println!("  Workspace: {}", workspace_dir.display());
    println!();

    if !cli.no_open {
        let url = format!("http://127.0.0.1:{}", actual_port);
        let _ = open::that(&url);
    }

    // Serve
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            shutdown_rx.await.ok();
        })
        .await
        .unwrap();
}
