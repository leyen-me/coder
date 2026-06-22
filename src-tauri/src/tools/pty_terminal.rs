use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use super::shell_registry::{ShellRegistry, ShellState};
use super::shell::ShellOutputEvent;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PtySessionInfo {
    pub pty_id: String,
    pub cwd: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyOutputEvent {
    pub pty_id: String,
    pub data: String,
}

struct PtySession {
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Box<dyn Write + Send>,
}

pub struct PtyRegistry {
    sessions: HashMap<String, PtySession>,
}

impl PtyRegistry {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }

    fn next_pty_id(&self) -> String {
        format!(
            "pty-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        )
    }

    pub fn create(
        &mut self,
        app: AppHandle,
        shell_reg: Arc<Mutex<ShellRegistry>>,
        cwd: String,
        cols: u16,
        rows: u16,
    ) -> Result<PtySessionInfo, String> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| format!("Failed to open PTY: {error}"))?;

        let shell = super::runtime::resolve_shell_for_command();
        let mut command = CommandBuilder::new(&shell);
        command.cwd(&cwd);
        for (key, value) in crate::shell_env::pty_environment() {
            command.env(&key, &value);
        }

        let child = pair
            .slave
            .spawn_command(command)
            .map_err(|error| format!("Failed to spawn shell: {error}"))?;

        let master = pair.master;
        let mut reader = master
            .try_clone_reader()
            .map_err(|error| format!("Failed to clone PTY reader: {error}"))?;
        let writer = master
            .take_writer()
            .map_err(|error| format!("Failed to take PTY writer: {error}"))?;
        let killer = child.clone_killer();

        let pty_id = self.next_pty_id();
        self.sessions.insert(
            pty_id.clone(),
            PtySession {
                master,
                writer,
            },
        );

        // Register in ShellRegistry so it appears in list_shells
        {
            let mut reg = shell_reg
                .lock()
                .map_err(|_| "Shell registry lock poisoned")?;
            let shell_id = pty_id.clone();
            let dir = cwd.clone();
            reg.register_pty(shell_id, format!("login shell ({dir})"), dir, killer);
        }

        let app_reader = app.clone();
        let pty_id_reader = pty_id.clone();
        let shell_reg_reader = shell_reg.clone();
        thread::spawn(move || {
            let mut buffer = [0u8; 4096];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(count) => {
                        let data = String::from_utf8_lossy(&buffer[..count]).to_string();
                        let _ = app_reader.emit(
                            "pty-output",
                            PtyOutputEvent {
                                pty_id: pty_id_reader.clone(),
                                data: data.clone(),
                            },
                        );
                        // Also emit shell-output so the ShellProcess store picks it up
                        let _ = app_reader.emit(
                            "shell-output",
                            ShellOutputEvent {
                                shell_id: pty_id_reader.clone(),
                                stream: "stdout".to_string(),
                                data: data.clone(),
                            },
                        );
                        // Accumulate in ShellRegistry for read_shell_logs
                        if let Ok(mut reg) = shell_reg_reader.lock() {
                            reg.append_pty_output(&pty_id_reader, &data);
                        }
                    }
                    Err(_) => break,
                }
            }
            // Mark as finished
            if let Ok(mut reg) = shell_reg_reader.lock() {
                reg.finish_pty(
                    &pty_id_reader,
                    super::shell::ShellStatus::Completed,
                    Some(0),
                );
            }
            let _ = app_reader.emit(
                "pty-closed",
                serde_json::json!({ "ptyId": pty_id_reader.clone() }),
            );
            let _ = app_reader.emit(
                "shell-finished",
                serde_json::json!({
                    "shellId": pty_id_reader,
                    "exitCode": 0,
                    "status": "completed",
                }),
            );
        });

        Ok(PtySessionInfo { pty_id, cwd })
    }

    pub fn write(&mut self, pty_id: &str, data: &str) -> Result<(), String> {
        let session = self
            .sessions
            .get_mut(pty_id)
            .ok_or_else(|| format!("Unknown pty_id: {pty_id}"))?;
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|error| format!("Failed to write to PTY: {error}"))
    }

    pub fn resize(&mut self, pty_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let session = self
            .sessions
            .get(pty_id)
            .ok_or_else(|| format!("Unknown pty_id: {pty_id}"))?;
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| format!("Failed to resize PTY: {error}"))
    }

    pub fn close(&mut self, pty_id: &str) -> Result<(), String> {
        let session = self
            .sessions
            .remove(pty_id)
            .ok_or_else(|| format!("Unknown pty_id: {pty_id}"))?;
        // Drop session — master is closed, writer is dropped,
        // the PTY reader thread will detect EOF and update ShellRegistry.
        drop(session);
        Ok(())
    }
}

pub struct PtyState(pub Arc<Mutex<PtyRegistry>>);

#[tauri::command]
pub fn pty_create(
    app: AppHandle,
    pty_state: State<'_, PtyState>,
    shell_state: State<'_, ShellState>,
    cwd: String,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<PtySessionInfo, String> {
    let mut registry = pty_state
        .0
        .lock()
        .map_err(|_| "PTY registry lock poisoned")?;
    registry.create(
        app,
        shell_state.0.clone(),
        cwd,
        cols.unwrap_or(80),
        rows.unwrap_or(24),
    )
}

#[tauri::command]
pub fn pty_write(state: State<'_, PtyState>, pty_id: String, data: String) -> Result<(), String> {
    let mut registry = state.0.lock().map_err(|_| "PTY registry lock poisoned")?;
    registry.write(&pty_id, &data)
}

#[tauri::command]
pub fn pty_resize(
    state: State<'_, PtyState>,
    pty_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let mut registry = state.0.lock().map_err(|_| "PTY registry lock poisoned")?;
    registry.resize(&pty_id, cols, rows)
}

#[tauri::command]
pub fn pty_close(state: State<'_, PtyState>, pty_id: String) -> Result<(), String> {
    let mut registry = state.0.lock().map_err(|_| "PTY registry lock poisoned")?;
    registry.close(&pty_id)
}
