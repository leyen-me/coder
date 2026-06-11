use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

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
    child_killer: Box<dyn portable_pty::ChildKiller + Send + Sync>,
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
                child_killer: killer,
            },
        );

        let app_reader = app.clone();
        let pty_id_reader = pty_id.clone();
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
                                data,
                            },
                        );
                    }
                    Err(_) => break,
                }
            }
            let _ = app_reader.emit("pty-closed", serde_json::json!({ "ptyId": pty_id_reader }));
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
        let mut session = self
            .sessions
            .remove(pty_id)
            .ok_or_else(|| format!("Unknown pty_id: {pty_id}"))?;
        let _ = session.child_killer.kill();
        Ok(())
    }
}

pub struct PtyState(pub Arc<Mutex<PtyRegistry>>);

#[tauri::command]
pub fn pty_create(
    app: AppHandle,
    state: State<'_, PtyState>,
    cwd: String,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<PtySessionInfo, String> {
    let mut registry = state.0.lock().map_err(|_| "PTY registry lock poisoned")?;
    registry.create(app, cwd, cols.unwrap_or(80), rows.unwrap_or(24))
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
