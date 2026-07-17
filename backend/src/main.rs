use std::io::{IsTerminal, stdout};
use std::net::IpAddr;

use clap::{ArgAction, Parser};

use coder_lib::server::{start_server, ServerOptions};

#[derive(Parser)]
#[command(
    name = "coder",
    about = "Coder — AI-powered coding assistant",
    disable_version_flag = true
)]
struct Cli {
    /// Port to listen on (default: 1421 in dev, random in release)
    #[arg(short, long)]
    port: Option<u16>,

    /// Do not open browser automatically
    #[arg(long)]
    no_open: bool,

    /// Show version information
    #[arg(short = 'v', long, action = ArgAction::SetTrue)]
    version: bool,
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
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let cli = Cli::parse();

    if cli.version {
        println!("coder {}", env!("CARGO_PKG_VERSION"));
        return;
    }

    let server = start_server(ServerOptions {
        port: cli.port,
        loopback_only: false,
        workspace_dir: None,
    })
    .await
    .expect("Failed to start server");

    let state_for_cleanup = server.state.clone();
    let (ctrlc_tx, ctrlc_rx) = tokio::sync::oneshot::channel::<()>();
    let ctrlc_tx = std::sync::Mutex::new(Some(ctrlc_tx));

    ctrlc::set_handler(move || {
        log::info!("Received Ctrl+C, shutting down...");
        coder_lib::cleanup_background_shells(&state_for_cleanup);
        if let Some(tx) = ctrlc_tx.lock().unwrap().take() {
            let _ = tx.send(());
        }
    })
    .expect("Failed to set Ctrl+C handler");

    print_startup_banner(server.port);

    if !cli.no_open {
        let url = format!("http://localhost:{}/", server.port);
        let _ = open::that(&url);
    }

    let _ = ctrlc_rx.await;
    server.shutdown().await;
}
