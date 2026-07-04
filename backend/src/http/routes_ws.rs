use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
};
use futures::{SinkExt, StreamExt};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use std::sync::Arc;

use crate::AppState;

pub async fn handle_pty_ws(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_pty_socket(socket, state))
}

async fn handle_pty_socket(mut socket: WebSocket, state: Arc<AppState>) {
    let pty_system = native_pty_system();
    let pair = match pty_system.openpty(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    }) {
        Ok(pair) => pair,
        Err(e) => {
            let _ = socket
                .send(Message::Text(format!("PTY error: {e}").into()))
                .await;
            return;
        }
    };

    let pty_id = uuid::Uuid::new_v4().to_string();
    let shell = resolve_shell();
    let workspace_dir = state.workspace_dir.clone();

    let mut command = CommandBuilder::new(&shell);
    command.cwd(workspace_dir.to_str().unwrap_or("/"));
    command.env("TERM", "xterm-256color");
    for (key, value) in std::env::vars() {
        if !key.starts_with("CARGO") && !key.starts_with("RUST") && key != "SSH_AUTH_SOCK" {
            command.env(&key, &value);
        }
    }

    let mut child = match pair.slave.spawn_command(command) {
        Ok(child) => child,
        Err(e) => {
            let _ = socket
                .send(Message::Text(format!("Failed to spawn shell: {e}").into()))
                .await;
            return;
        }
    };

    let killable_child = child.clone_killer();
    {
        let mut reg = state.shell_registry.lock().unwrap();
        reg.register_pty(
            pty_id.clone(),
            format!("Human terminal ({})", shell),
            workspace_dir.to_string_lossy().to_string(),
            killable_child,
        );
    }

    let mut reader = pair.master.try_clone_reader().unwrap();
    let mut writer = pair.master.take_writer().unwrap();

    let (mut ws_sender, mut ws_receiver) = socket.split();

    // PTY → WebSocket
    let pty_id_sender = pty_id.clone();
    let send_task = tokio::spawn(async move {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if ws_sender
                        .send(Message::Binary(buf[..n].to_vec().into()))
                        .await
                        .is_err()
                    {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        log::info!("PTY reader finished for {}", pty_id_sender);
    });

    // WebSocket → PTY
    while let Some(Ok(msg)) = ws_receiver.next().await {
        match msg {
            Message::Text(text) => {
                // Try to parse as control message, otherwise treat as raw input
                if let Ok(ctrl) = serde_json::from_str::<PtyControl>(&text) {
                    match ctrl {
                        PtyControl::Resize { cols, rows } => {
                            pair.master
                                .resize(PtySize {
                                    rows,
                                    cols,
                                    pixel_width: 0,
                                    pixel_height: 0,
                                })
                                .ok();
                        }
                        PtyControl::Input(data) => {
                            if writer.write_all(data.as_bytes()).is_err() {
                                log::warn!("PTY write failed for {}", pty_id);
                                break;
                            }
                        }
                    }
                } else if writer.write_all(text.as_bytes()).is_err() {
                    log::warn!("PTY write failed for {}", pty_id);
                    break;
                }
            }
            Message::Binary(data) => {
                if writer.write_all(&data).is_err() {
                    log::warn!("PTY write failed for {}", pty_id);
                    break;
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    // Cleanup: drop PTY master handles before waiting so the shell child can exit.
    drop(writer);
    drop(pair.master);
    send_task.abort();
    let exit_code = tokio::task::spawn_blocking(move || {
        child
            .wait()
            .ok()
            .map(|status| status.exit_code() as i32)
    })
    .await
    .ok()
    .flatten();
    {
        let mut reg = state.shell_registry.lock().unwrap();
        let status = match exit_code {
            Some(0) => crate::tools::shell::ShellStatus::Completed,
            Some(_) => crate::tools::shell::ShellStatus::Failed,
            None => crate::tools::shell::ShellStatus::Failed,
        };
        reg.finish_pty(&pty_id, status, exit_code);
    }
}

#[derive(serde::Deserialize)]
#[serde(tag = "type")]
enum PtyControl {
    Resize { cols: u16, rows: u16 },
    Input(String),
}

fn resolve_shell() -> String {
    std::env::var("SHELL")
        .or_else(|_| std::env::var("COMSPEC"))
        .unwrap_or_else(|_| {
            if cfg!(target_os = "windows") {
                "cmd.exe".to_string()
            } else {
                "/bin/bash".to_string()
            }
        })
}
