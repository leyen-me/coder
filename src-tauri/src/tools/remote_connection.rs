use std::fs;
use std::io::{ErrorKind, Read};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use ssh2::{Channel, Session};
use tauri::async_runtime::spawn;
use tokio::time::sleep;

const IDLE_TIMEOUT: Duration = Duration::from_secs(5 * 60); // 5 minutes
const IDLE_SCAN_INTERVAL: Duration = Duration::from_secs(60);
const SSH_KEEPALIVE_INTERVAL: u32 = 15;

/// Hard limit for remote command execution. Prevents Agent from hanging forever
/// on interactive commands (top, vim, node, etc.).
const REMOTE_EXEC_HARD_LIMIT: Duration = Duration::from_secs(600); // 10 minutes
const STREAM_POLL_INTERVAL: Duration = Duration::from_millis(200);

/// Authentication configuration, matching the frontend type.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum RemoteTargetAuth {
    #[serde(rename = "agent")]
    Agent,
    #[serde(rename = "key")]
    Key { key_path: String },
    #[serde(rename = "keyContent")]
    KeyContent { content: String },
    #[serde(rename = "password")]
    Password { password: String },
}

/// Remote target configuration, matching the frontend type.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteTargetConfig {
    pub alias: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub auth: RemoteTargetAuth,
}

/// Result of an SSH exec call.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteExecResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    /// Whether the command was terminated due to the hard execution time limit.
    pub timed_out: bool,
}

/// Result of a connection test.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestConnectionResult {
    pub ok: bool,
    pub message: String,
}

/// An SSH session wrapping `ssh2::Session` with mutex protection and idle tracking.
pub struct SshSession {
    session: Mutex<Session>,
    last_used: Mutex<Instant>,
}

impl SshSession {
    /// Create a new SSH session and authenticate.
    fn connect(config: &RemoteTargetConfig) -> Result<Arc<Self>, String> {
        let tcp = std::net::TcpStream::connect(format!("{}:{}", config.host, config.port))
            .map_err(|e| format!("TCP connection failed: {e}"))?;

        tcp.set_read_timeout(Some(Duration::from_secs(30)))
            .ok();
        tcp.set_write_timeout(Some(Duration::from_secs(30)))
            .ok();

        let mut session = Session::new()
            .map_err(|e| format!("Failed to create SSH session: {e}"))?;

        session.set_tcp_stream(tcp);
        session
            .handshake()
            .map_err(|e| format!("SSH handshake failed: {e}"))?;

        // Host key policy: accept-new (trust on first use)
        let _ = session.host_key();

        // Authenticate
        match &config.auth {
            RemoteTargetAuth::Agent => {
                session
                    .userauth_agent(config.user.as_str())
                    .map_err(|e| format!("SSH agent auth failed: {e}"))?;
            }
            RemoteTargetAuth::Key { key_path } => {
                session
                    .userauth_pubkey_file(
                        config.user.as_str(),
                        None,
                        std::path::Path::new(key_path),
                        None,
                    )
                    .map_err(|e| format!("SSH key auth failed: {e}"))?;
            }
            RemoteTargetAuth::KeyContent { content } => {
                // Write the key to a temporary file, then use userauth_pubkey_file.
                // userauth_pubkey_memory is not available in ssh2 0.9.x on crates.io.
                let tmp_dir = std::env::temp_dir().join(format!(
                    "coder-ssh-key-{}",
                    uuid::Uuid::new_v4()
                ));
                fs::create_dir_all(&tmp_dir).map_err(|e| {
                    format!("Failed to create temp dir for SSH key: {e}")
                })?;
                let key_path = tmp_dir.join("id_rsa");
                fs::write(&key_path, content.as_bytes()).map_err(|e| {
                    format!("Failed to write SSH key to temp file: {e}")
                })?;
                // Restrict permissions on Unix so libssh2 doesn't refuse the key.
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    fs::set_permissions(&key_path, fs::Permissions::from_mode(0o600)).ok();
                }
                let result = session.userauth_pubkey_file(
                    config.user.as_str(),
                    None,
                    &key_path,
                    None,
                );
                // Clean up the temp directory regardless of auth result.
                let _ = fs::remove_dir_all(&tmp_dir);
                result.map_err(|e| format!("SSH key content auth failed: {e}"))?;
            }
            RemoteTargetAuth::Password { password } => {
                session
                    .userauth_password(config.user.as_str(), password.as_str())
                    .map_err(|e| format!("SSH password auth failed: {e}"))?;
            }
        }

        if !session.authenticated() {
            return Err("SSH authentication failed: not authenticated after attempt".to_string());
        }

        // Keepalive
        session.set_keepalive(true, SSH_KEEPALIVE_INTERVAL);

        let session = Arc::new(SshSession {
            session: Mutex::new(session),
            last_used: Mutex::new(Instant::now()),
        });

        Ok(session)
    }

    /// Check if the session is still alive by trying to open a trivial channel.
    /// Uses `try_lock` so the reaper does not block when a streaming command holds the lock.
    fn is_alive(&self) -> bool {
        let Ok(session) = self.session.try_lock() else {
            return true; // In use by a streaming command, assume alive
        };
        // Try to open a channel to check if the connection is still alive
        session.channel_session().is_ok()
    }

    /// Execute a command on this session with streaming reads and a hard time limit.
    /// Returns partial stdout/stderr if the command exceeds the limit.
    fn exec_streaming(&self, command: &str) -> Result<RemoteExecResult, String> {
        // Update last used timestamp
        if let Ok(mut last) = self.last_used.lock() {
            *last = Instant::now();
        }

        let session = self
            .session
            .lock()
            .map_err(|_| "SSH session lock poisoned".to_string())?;

        // Set a short timeout so channel.read() returns promptly when no data
        session.set_timeout(200);

        let mut channel: Channel = session
            .channel_session()
            .map_err(|e| format!("Failed to open SSH channel: {e}"))?;

        channel
            .exec(command)
            .map_err(|e| format!("Failed to exec command: {e}"))?;

        let deadline = Instant::now() + REMOTE_EXEC_HARD_LIMIT;
        let mut stdout_buf: Vec<u8> = Vec::new();
        let mut stderr_buf: Vec<u8> = Vec::new();
        let mut read_buf = [0u8; 8192];
        let mut stdout_eof = false;
        let mut stderr_eof = false;

        loop {
            // Read stdout with timeout
            if !stdout_eof {
                loop {
                    match channel.read(&mut read_buf) {
                        Ok(0) => {
                            stdout_eof = true;
                            break;
                        }
                        Ok(n) => stdout_buf.extend_from_slice(&read_buf[..n]),
                        Err(e) if e.kind() == ErrorKind::TimedOut
                            || e.kind() == ErrorKind::WouldBlock => break,
                        Err(e) => {
                            return Err(format!("SSH stdout read error: {e}"));
                        }
                    }
                }
            }

            // Read stderr with timeout
            if !stderr_eof {
                loop {
                    match channel.stderr().read(&mut read_buf) {
                        Ok(0) => {
                            stderr_eof = true;
                            break;
                        }
                        Ok(n) => stderr_buf.extend_from_slice(&read_buf[..n]),
                        Err(e) if e.kind() == ErrorKind::TimedOut
                            || e.kind() == ErrorKind::WouldBlock => break,
                        Err(e) => {
                            return Err(format!("SSH stderr read error: {e}"));
                        }
                    }
                }
            }

            // Both streams reached EOF → command completed
            if stdout_eof && stderr_eof {
                channel.wait_close().ok();
                let exit_code = channel.exit_status().ok();
                // Restore default timeout
                session.set_timeout(30000);
                return Ok(RemoteExecResult {
                    stdout: String::from_utf8_lossy(&stdout_buf).to_string(),
                    stderr: String::from_utf8_lossy(&stderr_buf).to_string(),
                    exit_code,
                    timed_out: false,
                });
            }

            // Check hard limit
            if Instant::now() >= deadline {
                // Restore default timeout
                session.set_timeout(30000);
                return Ok(RemoteExecResult {
                    stdout: String::from_utf8_lossy(&stdout_buf).to_string(),
                    stderr: String::from_utf8_lossy(&stderr_buf).to_string(),
                    exit_code: None,
                    timed_out: true,
                });
            }

            std::thread::sleep(STREAM_POLL_INTERVAL);
        }
    }

    /// Execute a command and stream output chunks through a std mpsc sender.
    /// Runs in a blocking thread: holds `self.session` lock for the entire duration.
    /// Checks `killed` before each read iteration so `kill_shell` can interrupt.
    pub fn exec_to_channel(
        &self,
        command: &str,
        killed: &AtomicBool,
        sender: std::sync::mpsc::Sender<SshStreamEvent>,
    ) {
        // Update last used timestamp
        if let Ok(mut last) = self.last_used.lock() {
            *last = Instant::now();
        }

        let session = match self.session.lock() {
            Ok(s) => s,
            Err(_) => {
                let _ = sender.send(SshStreamEvent::Error(
                    "SSH session lock poisoned".to_string(),
                ));
                return;
            }
        };

        session.set_timeout(200);

        let mut channel: Channel = match session.channel_session() {
            Ok(c) => c,
            Err(e) => {
                let _ = sender.send(SshStreamEvent::Error(format!(
                    "Failed to open SSH channel: {e}"
                )));
                return;
            }
        };

        if let Err(e) = channel.exec(command) {
            let _ = sender.send(SshStreamEvent::Error(format!(
                "Failed to exec command: {e}"
            )));
            return;
        }

        let mut read_buf = [0u8; 8192];
        let mut stdout_eof = false;
        let mut stderr_eof = false;

        loop {
            // Check kill signal before each round
            if killed.load(Ordering::SeqCst) {
                let _ = sender.send(SshStreamEvent::Killed);
                return;
            }

            // Read stdout chunks
            if !stdout_eof {
                loop {
                    match channel.read(&mut read_buf) {
                        Ok(0) => {
                            stdout_eof = true;
                            break;
                        }
                        Ok(n) => {
                            let chunk = read_buf[..n].to_vec();
                            if sender.send(SshStreamEvent::Stdout(chunk)).is_err() {
                                return; // receiver dropped
                            }
                        }
                        Err(e)
                            if e.kind() == ErrorKind::TimedOut
                                || e.kind() == ErrorKind::WouldBlock => break,
                        Err(e) => {
                            let _ = sender.send(SshStreamEvent::Error(format!(
                                "SSH stdout read error: {e}"
                            )));
                            return;
                        }
                    }
                }
            }

            // Read stderr chunks
            if !stderr_eof {
                loop {
                    match channel.stderr().read(&mut read_buf) {
                        Ok(0) => {
                            stderr_eof = true;
                            break;
                        }
                        Ok(n) => {
                            let chunk = read_buf[..n].to_vec();
                            if sender.send(SshStreamEvent::Stderr(chunk)).is_err() {
                                return; // receiver dropped
                            }
                        }
                        Err(e)
                            if e.kind() == ErrorKind::TimedOut
                                || e.kind() == ErrorKind::WouldBlock => break,
                        Err(e) => {
                            let _ = sender.send(SshStreamEvent::Error(format!(
                                "SSH stderr read error: {e}"
                            )));
                            return;
                        }
                    }
                }
            }

            // Both EOF → command completed
            if stdout_eof && stderr_eof {
                channel.wait_close().ok();
                let exit_code = channel.exit_status().ok();
                let _ = sender.send(SshStreamEvent::ExitCode(exit_code));
                session.set_timeout(30000);
                return;
            }

            std::thread::sleep(STREAM_POLL_INTERVAL);
        }
    }
}

/// Events pushed from the blocking SSH reader thread to the blocking consumer task.
pub enum SshStreamEvent {
    Stdout(Vec<u8>),
    Stderr(Vec<u8>),
    ExitCode(Option<i32>),
    Killed,
    Error(String),
}

/// Pool of SSH sessions, keyed by alias.
pub struct RemoteConnectionPool {
    pub sessions: Arc<Mutex<Vec<(String, Arc<SshSession>, Instant)>>>,
}

impl RemoteConnectionPool {
    pub fn new() -> Self {
        RemoteConnectionPool {
            sessions: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Start the idle session reaper.
    pub fn start_idle_reaper(&self) {
        let sessions = self.sessions.clone();
        spawn(async move {
            loop {
                sleep(IDLE_SCAN_INTERVAL).await;
                let now = Instant::now();
                if let Ok(mut guard) = sessions.lock() {
                    guard.retain(|(_, session, last_used)| {
                        let idle = now.duration_since(*last_used);
                        if idle >= IDLE_TIMEOUT {
                            log::info!(
                                "SSH session idle for {:?}, dropping",
                                idle
                            );
                            false // remove from pool
                        } else {
                            // Keep alive check
                            if !session.is_alive() {
                                log::warn!("SSH session dead, removing from pool");
                                false
                            } else {
                                true
                            }
                        }
                    });
                }
            }
        });
    }

    /// Get or create an SSH session for the given alias and config.
    pub fn get_or_connect(
        &self,
        alias: &str,
        config: &RemoteTargetConfig,
    ) -> Result<Arc<SshSession>, String> {
        let mut guard = self
            .sessions
            .lock()
            .map_err(|_| "Connection pool lock poisoned")?;

        // Look for an existing session
        if let Some(pos) = guard.iter().position(|(a, session, _)| {
            a == alias && session.is_alive()
        }) {
            let (existing_alias, session, _) = guard.remove(pos);
            let now = Instant::now();
            guard.push((existing_alias, session.clone(), now));
            return Ok(session);
        }

        // Create new session
        log::info!("Connecting to remote target: {}@{}:{}", config.user, config.host, config.port);
        let session = SshSession::connect(config)?;

        let now = Instant::now();
        guard.push((alias.to_string(), session.clone(), now));

        Ok(session)
    }

    /// Execute a command on a remote target with streaming reads and hard time limit.
    /// Retries once on transient connection or execution failures (e.g. network jitter,
    /// SSH server momentarily busy).
    pub fn exec(&self, config: &RemoteTargetConfig, command: &str) -> Result<RemoteExecResult, String> {
        let alias = &config.alias;

        // First attempt — includes both connection and execution
        let session = self.get_or_connect(alias, config).or_else(|_| {
            log::info!("Retrying remote exec on {} after connection failure", alias);
            // Remove any stale session entry
            if let Ok(mut guard) = self.sessions.lock() {
                guard.retain(|(a, _, _)| a != alias);
            }
            self.get_or_connect(alias, config)
        })?;

        let result = session.exec_streaming(command);

        // On execution failure, retry once after reconnection
        if result.is_err() {
            log::info!("Retrying remote exec on {} after reconnection", alias);
            if let Ok(mut guard) = self.sessions.lock() {
                guard.retain(|(a, _, _)| a != alias);
            }
            let session = self.get_or_connect(alias, config)?;
            return session.exec_streaming(command);
        }

        result
    }
}

/// Tauri command: test remote connection (async, runs blocking SSH on background thread
/// so the UI thread is not frozen).
const TEST_CONNECT_TIMEOUT: Duration = Duration::from_secs(15);

#[tauri::command]
pub async fn test_remote_connection(
    config: RemoteTargetConfig,
) -> Result<TestConnectionResult, String> {
    // Extract display fields before moving config into the blocking closure.
    let user = config.user.clone();
    let host = config.host.clone();
    let port = config.port;

    let result = tokio::time::timeout(
        TEST_CONNECT_TIMEOUT,
        tokio::task::spawn_blocking(move || SshSession::connect(&config)),
    )
    .await
    .map_err(|_| {
        format!(
            "Connection timed out after {} seconds",
            TEST_CONNECT_TIMEOUT.as_secs()
        )
    })? // tokio::time::timeout elapsed
    .map_err(|e| format!("Internal error: {e}"))?; // JoinError

    match result {
        Ok(_session) => Ok(TestConnectionResult {
            ok: true,
            message: format!(
                "Successfully connected to {}@{}:{}",
                user, host, port
            ),
        }),
        Err(e) => Ok(TestConnectionResult {
            ok: false,
            message: format!("Connection failed: {e}"),
        }),
    }
}
