use std::fs;
use std::io::Read;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use ssh2::{Channel, Session};
use tauri::async_runtime::spawn;
use tokio::time::sleep;

const IDLE_TIMEOUT: Duration = Duration::from_secs(5 * 60); // 5 minutes
const IDLE_SCAN_INTERVAL: Duration = Duration::from_secs(60);
const SSH_KEEPALIVE_INTERVAL: u32 = 15;

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
    fn is_alive(&self) -> bool {
        let Ok(session) = self.session.lock() else {
            return false;
        };
        // Try to open a channel to check if the connection is still alive
        session.channel_session().is_ok()
    }

    /// Execute a command on this session and return the output.
    fn exec(&self, command: &str) -> Result<RemoteExecResult, String> {
        // Update last used timestamp
        if let Ok(mut last) = self.last_used.lock() {
            *last = Instant::now();
        }

        let session = self
            .session
            .lock()
            .map_err(|_| "SSH session lock poisoned".to_string())?;

        let mut channel: Channel = session
            .channel_session()
            .map_err(|e| format!("Failed to open SSH channel: {e}"))?;

        channel
            .exec(command)
            .map_err(|e| format!("Failed to exec command: {e}"))?;

        let mut stdout = String::new();
        let mut stderr = String::new();

        let _ = channel.read_to_string(&mut stdout);
        let _ = channel.stderr().read_to_string(&mut stderr);

        let exit_code = channel.exit_status().ok();

        channel.wait_close().ok();

        Ok(RemoteExecResult {
            stdout,
            stderr,
            exit_code,
        })
    }
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

    /// Execute a command on a remote target, with auto-reconnect (once).
    pub fn exec(&self, config: &RemoteTargetConfig, command: &str) -> Result<RemoteExecResult, String> {
        let alias = &config.alias;

        // First attempt
        let session = self.get_or_connect(alias, config)?;
        let result = session.exec(command);

        // On failure, retry once if session seems dead
        if result.is_err() {
            log::info!("Retrying remote exec on {} after reconnection", alias);
            // Remove dead session
            if let Ok(mut guard) = self.sessions.lock() {
                guard.retain(|(a, _, _)| a != alias);
            }
            // Retry
            let session = self.get_or_connect(alias, config)?;
            return session.exec(command);
        }

        result
    }
}

/// Tauri command: test remote connection
#[tauri::command]
pub fn test_remote_connection(
    config: RemoteTargetConfig,
) -> Result<TestConnectionResult, String> {
    match SshSession::connect(&config) {
        Ok(_session) => Ok(TestConnectionResult {
            ok: true,
            message: format!(
                "Successfully connected to {}@{}:{}",
                config.user, config.host, config.port
            ),
        }),
        Err(e) => Ok(TestConnectionResult {
            ok: false,
            message: format!("Connection failed: {e}"),
        }),
    }
}
