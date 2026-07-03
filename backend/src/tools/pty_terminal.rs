use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;

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
        cwd: String,
        cols: u16,
        rows: u16,
        broadcaster: Option<Arc<crate::SseBroadcaster>>,
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
        let _killer = child.clone_killer();

        let pty_id = self.next_pty_id();
        self.sessions.insert(
            pty_id.clone(),
            PtySession {
                master,
                writer,
            },
        );

        let pty_id_reader = pty_id.clone();
        let broadcaster_reader = broadcaster.clone();
        thread::spawn(move || {
            let mut buffer = [0u8; 4096];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(count) => {
                        let data = String::from_utf8_lossy(&buffer[..count]).to_string();
                        if let Some(b) = &broadcaster_reader {
                            let _ = b.emit_event(
                                &format!("shell-{pty_id_reader}"),
                                &crate::AgentSseEvent::ShellOutput {
                                    shell_id: pty_id_reader.clone(),
                                    stream: "stdout".to_string(),
                                    data: data.clone(),
                                },
                            );
                        }
                    }
                    Err(_) => break,
                }
            }
            if let Some(b) = &broadcaster_reader {
                let _ = b.emit_event(
                    &format!("shell-{pty_id_reader}"),
                    &crate::AgentSseEvent::ShellFinished {
                        shell_id: pty_id_reader.clone(),
                        output: super::shell::ShellOutput {
                            command: String::new(),
                            description: Some("Human terminal".to_string()),
                            working_directory: String::new(),
                            stdout: String::new(),
                            stderr: String::new(),
                            stdout_truncated: false,
                            stderr_truncated: false,
                            stdout_total_bytes: 0,
                            stderr_total_bytes: 0,
                            exit_code: Some(0),
                            duration_ms: 0,
                            status: super::shell::ShellStatus::Completed,
                            shell_id: Some(pty_id_reader.clone()),
                            source: "human".to_string(),
                        },
                    },
                );
            }
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
        // the PTY reader thread will detect EOF and update via broadcaster.
        drop(session);
        Ok(())
    }

    pub fn insert(&mut self, pty_id: String, session: PtySession) {
        self.sessions.insert(pty_id, session);
    }

    pub fn remove(&mut self, pty_id: &str) -> Option<PtySession> {
        self.sessions.remove(pty_id)
    }
}
