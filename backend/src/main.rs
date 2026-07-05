use std::io::{IsTerminal, stdout};
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;

use clap::Parser;

#[derive(Parser)]
#[command(name = "coder", about = "Coder — AI-powered coding assistant")]
struct Cli {
    /// Port to listen on (default: 1421 in dev, random in release)
    #[arg(short, long)]
    port: Option<u16>,

    /// Do not open browser automatically
    #[arg(long)]
    no_open: bool,
}

fn stdout_supports_color() -> bool {
    stdout().is_terminal()
}

fn green(text: &str) -> String {
    if stdout_supports_color() {
        format!("\x1b[32m{text}\x1b[0m")
    } else {
        text.to_string()
    }
}

fn cyan(text: &str) -> String {
    if stdout_supports_color() {
        format!("\x1b[36m{text}\x1b[0m")
    } else {
        text.to_string()
    }
}

fn bold(text: &str) -> String {
    if stdout_supports_color() {
        format!("\x1b[1m{text}\x1b[0m")
    } else {
        text.to_string()
    }
}

fn collect_network_urls(port: u16) -> Vec<String> {
    let Ok(interfaces) = if_addrs::get_if_addrs() else {
        return Vec::new();
    };

    let mut urls: Vec<String> = interfaces
        .into_iter()
        .filter(|iface| !iface.is_loopback())
        .filter_map(|iface| match iface.ip() {
            IpAddr::V4(v4) => Some(format!("http://{v4}:{port}/")),
            IpAddr::V6(v6) if !v6.is_loopback() && !v6.is_unspecified() => {
                Some(format!("http://[{v6}]:{port}/"))
            }
            _ => None,
        })
        .collect();

    urls.sort();
    urls.dedup();
    urls
}

fn print_startup_banner(port: u16) {
    let version = env!("CARGO_PKG_VERSION");
    let local_url = format!("http://localhost:{port}/");

    println!();
    println!("  {}", green(&format!("CODER v{version}")));
    println!();
    println!(
        "  {}  {}:   {}",
        green("➜"),
        bold("Local"),
        cyan(&local_url)
    );
    for url in collect_network_urls(port) {
        println!(
            "  {}  {}: {}",
            green("➜"),
            bold("Network"),
            cyan(&url)
        );
    }
    println!();
}

#[tokio::main]
async fn main() {
    // Initialize logging
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let cli = Cli::parse();

    const WORKSPACE_SETTING_KEY: &str = "coder:workspace-dir";

    // Backend fallback only — real workspace comes from user selection in the UI.
    let workspace_dir = coder_lib::http::routes_settings::get_setting(WORKSPACE_SETTING_KEY)
        .map(PathBuf::from)
        .unwrap_or_else(coder_lib::get_coder_data_dir);

    // Determine port (default: 1421 for dev, 0 = random for release)
    #[cfg(debug_assertions)]
    let default_port = 1421;
    #[cfg(not(debug_assertions))]
    let default_port = 0;
    let port = cli.port.unwrap_or(default_port);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind address");

    let actual_port = listener.local_addr().unwrap().port();

    let state = coder_lib::initialize_app_state(
        &workspace_dir,
        format!("http://127.0.0.1:{actual_port}"),
    );

    if let Err(error) =
        coder_lib::db::purge_automation_sessions::purge_automation_sessions(&state.db)
    {
        log::error!("Failed to purge automation sessions: {error}");
    }

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
    print_startup_banner(actual_port);

    if !cli.no_open {
        let url = format!("http://localhost:{actual_port}/");
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
