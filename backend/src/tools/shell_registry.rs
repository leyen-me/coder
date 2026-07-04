use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::time::{sleep, Duration};

use super::remote_connection::RemoteConnectionPool;

const POST_KILL_WAIT_MS: u64 = 3_000;

use super::shell::{
    build_shell_output, normalize_block_until_ms, resolve_command_shell, resolve_working_directory,
    shell_command_builder, ReadShellLogsResponse, ShellInfo, ShellOutput,
    ShellStatus, ShellStatusFilter,
};

#[derive(Debug)]
struct RunningShell {
    command: String,
    description: Option<String>,
    working_directory: String,
    stdout: String,
    stderr: String,
    status: ShellStatus,
    exit_code: Option<i32>,
    started_at: Instant,
    task_id: Option<String>,
    pid: Option<u32>,
    killed: Arc<AtomicBool>,
    child: Arc<Mutex<Option<Child>>>,
    child_killer: Option<Box<dyn portable_pty::ChildKiller + Send + Sync>>,
    source: String,
}

pub struct ShellRegistry {
    shells: HashMap<String, RunningShell>,
}

fn floor_char_boundary(content: &str, index: usize) -> usize {
    let mut boundary = index.min(content.len());
    while boundary > 0 && !content.is_char_boundary(boundary) {
        boundary -= 1;
    }
    boundary
}

impl ShellRegistry {
    pub fn new() -> Self {
        Self {
            shells: HashMap::new(),
        }
    }

    fn next_shell_id(&self) -> String {
        format!(
            "shell-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        )
    }

    pub fn list(&self, status_filter: ShellStatusFilter) -> Vec<ShellInfo> {
        self.shells
            .iter()
            .filter(|(_, shell)| matches_status_filter(shell.status, status_filter))
            .map(|(shell_id, shell)| ShellInfo {
                shell_id: shell_id.clone(),
                command: shell.command.clone(),
                description: shell.description.clone(),
                working_directory: shell.working_directory.clone(),
                status: shell.status,
                exit_code: shell.exit_code,
                started_at_ms: shell.started_at.elapsed().as_millis() as u64,
                task_id: shell.task_id.clone(),
                stdout: shell.stdout.clone(),
                stderr: shell.stderr.clone(),
                source: shell.source.clone(),
            })
            .collect()
    }

    fn stop(&mut self, shell_id: &str, status: ShellStatus) -> Result<(), String> {
        let shell = self
            .shells
            .get_mut(shell_id)
            .ok_or_else(|| format!("Unknown shell_id: {shell_id}"))?;

        if matches!(shell.status, ShellStatus::Running | ShellStatus::Timeout) {
            kill_running_shell(shell);
            shell.status = status;
        }
        Ok(())
    }

    pub fn kill(&mut self, shell_id: &str) -> Result<(), String> {
        let shell = self
            .shells
            .get_mut(shell_id)
            .ok_or_else(|| format!("Unknown shell_id: {shell_id}"))?;

        if !matches!(shell.status, ShellStatus::Running | ShellStatus::Timeout) {
            return Err(format!(
                "Only running or timed-out shells can be killed: {shell_id} is {}",
                shell_status_label(shell.status)
            ));
        }

        kill_running_shell(shell);
        shell.status = ShellStatus::Cancelled;
        Ok(())
    }

    pub fn kill_by_task(&mut self, task_id: &str) -> usize {
        let ids: Vec<String> = self
            .shells
            .iter()
            .filter_map(|(id, shell)| {
                if shell.task_id.as_deref() == Some(task_id)
                    && Self::is_active_shell_status(shell.status)
                {
                    Some(id.clone())
                } else {
                    None
                }
            })
            .collect();

        self.kill_shell_ids(ids)
    }

    pub fn kill_all_active(&mut self) -> usize {
        let ids: Vec<String> = self
            .shells
            .iter()
            .filter_map(|(id, shell)| {
                if Self::is_active_shell_status(shell.status) {
                    Some(id.clone())
                } else {
                    None
                }
            })
            .collect();

        self.kill_shell_ids(ids)
    }

    fn is_active_shell_status(status: ShellStatus) -> bool {
        matches!(status, ShellStatus::Running | ShellStatus::Timeout)
    }

    fn kill_shell_ids(&mut self, ids: Vec<String>) -> usize {
        let mut killed = 0;
        for id in ids {
            if self.stop(&id, ShellStatus::Cancelled).is_ok() {
                killed += 1;
            }
        }
        killed
    }

    fn snapshot_output(&self, shell_id: &str) -> Result<ShellOutput, String> {
        let shell = self
            .shells
            .get(shell_id)
            .ok_or_else(|| format!("Unknown shell_id: {shell_id}"))?;

        Ok(build_shell_output(
            shell.command.clone(),
            shell.description.clone(),
            shell.working_directory.clone(),
            &shell.stdout,
            &shell.stderr,
            shell.exit_code,
            shell.started_at,
            shell.status,
            Some(shell_id.to_string()),
            shell.source.clone(),
        ))
    }

    pub async fn run_shell(
        registry: Arc<Mutex<ShellRegistry>>,
        broadcaster: Option<Arc<crate::SseBroadcaster>>,
        workspace_dir: String,
        command: String,
        description: Option<String>,
        working_directory: Option<String>,
        block_until_ms: Option<u64>,
        task_id: Option<String>,
    ) -> Result<ShellOutput, String> {
        let cwd = resolve_working_directory(&workspace_dir, working_directory.as_deref())?;
        let cwd_display = cwd.to_string_lossy().replace("\\\\", "/");
        let block_ms = normalize_block_until_ms(block_until_ms);

        let output = Self::spawn_background(
            registry.clone(),
            broadcaster.clone(),
            command,
            description,
            cwd,
            cwd_display,
            task_id,
        )
        .await?;

        if block_ms == 0 {
            return Ok(output);
        }

        let shell_id = output
            .shell_id
            .clone()
            .ok_or_else(|| "Shell did not return an id".to_string())?;

        Self::await_shell_shared(registry, shell_id, Some(block_ms), true).await
    }

    pub async fn await_shell_shared(
        registry: Arc<Mutex<ShellRegistry>>,
        shell_id: String,
        block_until_ms: Option<u64>,
        kill_on_timeout: bool,
    ) -> Result<ShellOutput, String> {
        {
            let reg = registry
                .lock()
                .map_err(|_| "Shell registry lock poisoned")?;
            if !reg.shells.contains_key(&shell_id) {
                return Err(format!("Unknown shell_id: {shell_id}"));
            }
        }

        let block_ms = normalize_block_until_ms(block_until_ms);
        let deadline = Instant::now() + Duration::from_millis(block_ms);

        loop {
            let status = {
                let reg = registry
                    .lock()
                    .map_err(|_| "Shell registry lock poisoned")?;
                reg.shells
                    .get(&shell_id)
                    .map(|shell| shell.status)
                    .ok_or_else(|| format!("Unknown shell_id: {shell_id}"))?
            };

            if status != ShellStatus::Running {
                let reg = registry
                    .lock()
                    .map_err(|_| "Shell registry lock poisoned")?;
                return reg.snapshot_output(&shell_id);
            }

            if Instant::now() >= deadline {
                if kill_on_timeout {
                    {
                        let mut reg = registry
                            .lock()
                            .map_err(|_| "Shell registry lock poisoned")?;
                        reg.stop(&shell_id, ShellStatus::Timeout)?;
                    }

                    let settle_deadline = Instant::now() + Duration::from_millis(POST_KILL_WAIT_MS);
                    loop {
                        let current_status = {
                            let reg = registry
                                .lock()
                                .map_err(|_| "Shell registry lock poisoned")?;
                            reg.shells
                                .get(&shell_id)
                                .map(|shell| shell.status)
                                .ok_or_else(|| format!("Unknown shell_id: {shell_id}"))?
                        };

                        if current_status != ShellStatus::Running
                            || Instant::now() >= settle_deadline
                        {
                            break;
                        }
                        sleep(Duration::from_millis(50)).await;
                    }

                    let reg = registry
                        .lock()
                        .map_err(|_| "Shell registry lock poisoned")?;
                    return reg.snapshot_output(&shell_id);
                }

                let mut reg = registry
                    .lock()
                    .map_err(|_| "Shell registry lock poisoned")?;
                if let Some(shell) = reg.shells.get_mut(&shell_id) {
                    if shell.status == ShellStatus::Running {
                        shell.status = ShellStatus::Timeout;
                    }
                }
                return reg.snapshot_output(&shell_id);
            }

            sleep(Duration::from_millis(100)).await;
        }
    }

    async fn spawn_background(
        registry: Arc<Mutex<ShellRegistry>>,
        broadcaster: Option<Arc<crate::SseBroadcaster>>,
        command: String,
        description: Option<String>,
        cwd: PathBuf,
        cwd_display: String,
        task_id: Option<String>,
    ) -> Result<ShellOutput, String> {
        let shell_id = {
            let reg = registry
                .lock()
                .map_err(|_| "Shell registry lock poisoned")?;
            reg.next_shell_id()
        };
        let started_at = Instant::now();
        let shell = resolve_command_shell();
        let (program, args) = shell_command_builder(&shell, &command);
        let environment = crate::shell_env::command_environment();

        // Agent shells use piped stdio instead of a PTY. On Windows, `cmd /C` inside a
        // PTY often never closes the master read side, which leaves the shell stuck in
        // Running until timeout and mixes terminal escape sequences into stdout.
        let mut cmd = Command::new(&program);
        cmd.current_dir(&cwd);
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());
        cmd.kill_on_drop(true);
        for (key, value) in &environment {
            cmd.env(key, value);
        }

        #[cfg(target_os = "windows")]
        {
            // Rust's Command.arg() applies CommandLineToArgvW-style escaping,
            // producing \" sequences that cmd.exe does not understand. Use
            // raw_arg to pass the command verbatim so CMD's native parser
            // can handle quotes correctly.
            cmd.arg("/C");
            cmd.as_std_mut().raw_arg(&command);
            cmd.as_std_mut().creation_flags(0x08000000);
        }
        #[cfg(not(target_os = "windows"))]
        {
            cmd.args(args);
        }
        #[cfg(target_os = "windows")]
        let _ = args;

        let mut child = cmd
            .spawn()
            .map_err(|error| format!("Failed to spawn command: {error}"))?;

        // Capture the OS PID before moving child into the slot, so
        // kill_running_shell can kill the process via pid even after
        // wait_for_child has taken the child out of the slot.
        let child_pid = child.id();
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let child_slot = Arc::new(Mutex::new(Some(child)));
        let killed = Arc::new(AtomicBool::new(false));

        {
            let mut reg = registry
                .lock()
                .map_err(|_| "Shell registry lock poisoned")?;
            reg.shells.insert(
                shell_id.clone(),
                RunningShell {
                    command: command.clone(),
                    description: description.clone(),
                    working_directory: cwd_display.clone(),
                    stdout: String::new(),
                    stderr: String::new(),
                    status: ShellStatus::Running,
                    exit_code: None,
                    started_at,
                    task_id,
                    pid: child_pid,
                    killed,
                    child: child_slot.clone(),
                    child_killer: None,
                    source: "agent".to_string(),
                },
            );
        }

        let shell_id_stdout = shell_id.clone();
        let shell_id_stderr = shell_id.clone();
        let registry_stdout = registry.clone();
        let registry_stderr = registry.clone();
        let broadcaster_stdout = broadcaster.clone();
        let broadcaster_stderr = broadcaster.clone();

        if let Some(stdout) = stdout {
            tokio::spawn(async move {
                read_stream(
                    stdout,
                    "stdout",
                    &shell_id_stdout,
                    broadcaster_stdout.as_ref().map(|v| &**v),
                    registry_stdout,
                )
                .await;
            });
        }

        if let Some(stderr) = stderr {
            tokio::spawn(async move {
                read_stream(
                    stderr,
                    "stderr",
                    &shell_id_stderr,
                    broadcaster_stderr.as_ref().map(|v| &**v),
                    registry_stderr,
                )
                .await;
            });
        }

        let registry_wait = registry.clone();
        let shell_id_wait = shell_id.clone();
        let broadcaster_wait = broadcaster.clone();
        tokio::spawn(async move {
            wait_for_child(registry_wait, shell_id_wait, broadcaster_wait, child_slot).await;
        });

        Ok(build_shell_output(
            command,
            description,
            cwd_display,
            "",
            "",
            None,
            started_at,
            ShellStatus::Running,
            Some(shell_id),
            "agent".to_string(),
        ))
    }

    /// Register a human PTY session in the shell registry so it appears in list_shells.
    pub fn register_pty(
        &mut self,
        shell_id: String,
        command: String,
        working_directory: String,
        child_killer: Box<dyn portable_pty::ChildKiller + Send + Sync>,
    ) {
        self.shells.insert(
            shell_id,
            RunningShell {
                command,
                description: Some("Human terminal".to_string()),
                working_directory,
                stdout: String::new(),
                stderr: String::new(),
                status: ShellStatus::Running,
                exit_code: None,
                started_at: Instant::now(),
                task_id: None,
                pid: None,
                killed: Arc::new(AtomicBool::new(false)),
                child: Arc::new(Mutex::new(None)),
                child_killer: Some(child_killer),
                source: "human".to_string(),
            },
        );
    }

    /// Append output to a shell's stdout (used by PTY reader threads).
    pub fn append_pty_output(&mut self, shell_id: &str, data: &str) {
        if let Some(shell) = self.shells.get_mut(shell_id) {
            shell.stdout.push_str(data);
        }
    }

    /// Mark a PTY shell as finished (used by PTY reader threads on EOF).
    pub fn finish_pty(&mut self, shell_id: &str, status: ShellStatus, exit_code: Option<i32>) {
        if let Some(shell) = self.shells.get_mut(shell_id) {
            if shell.status == ShellStatus::Running {
                shell.status = status;
                shell.exit_code = exit_code;
            }
        }
    }

    /// Read a portion of a shell's stdout/stderr.
    pub fn read_shell_logs(
        &self,
        shell_id: &str,
        stream: Option<String>,
        offset: Option<usize>,
        limit: Option<usize>,
    ) -> Result<super::shell::ReadShellLogsResponse, String> {
        let shell = self
            .shells
            .get(shell_id)
            .ok_or_else(|| format!("Unknown shell_id: {shell_id}"))?;

        let stream = stream.unwrap_or_else(|| "stdout".to_string());
        let offset = offset.unwrap_or(0);
        let max_limit = 65536;
        let limit = limit.unwrap_or(4096).min(max_limit);

        let content = if stream == "stderr" {
            &shell.stderr
        } else {
            &shell.stdout
        };
        let total_bytes = content.len();
        let safe_offset = floor_char_boundary(content, offset);
        let raw_end = (offset + limit).min(total_bytes);
        let safe_end = floor_char_boundary(content, raw_end);
        let data = if safe_offset >= total_bytes || safe_offset >= safe_end {
            String::new()
        } else {
            content[safe_offset..safe_end].to_string()
        };

        Ok(super::shell::ReadShellLogsResponse {
            shell_id: shell_id.to_string(),
            stream,
            data,
            offset: safe_offset,
            total_bytes,
            truncated: safe_end < total_bytes,
        })
    }
}

fn matches_status_filter(status: ShellStatus, status_filter: ShellStatusFilter) -> bool {
    matches!(status_filter, ShellStatusFilter::All)
        || matches!(
            (status_filter, status),
            (ShellStatusFilter::Running, ShellStatus::Running)
                | (ShellStatusFilter::Completed, ShellStatus::Completed)
                | (ShellStatusFilter::Failed, ShellStatus::Failed)
                | (ShellStatusFilter::Timeout, ShellStatus::Timeout)
                | (ShellStatusFilter::Cancelled, ShellStatus::Cancelled)
        )
}

fn shell_status_label(status: ShellStatus) -> &'static str {
    match status {
        ShellStatus::Running => "running",
        ShellStatus::Completed => "completed",
        ShellStatus::Failed => "failed",
        ShellStatus::Timeout => "timeout",
        ShellStatus::Cancelled => "cancelled",
    }
}

fn kill_running_shell(shell: &mut RunningShell) {
    shell.killed.store(true, Ordering::SeqCst);

    // Human PTY sessions
    if let Some(killer) = shell.child_killer.as_mut() {
        let _ = killer.kill();
    }

    // Agent piped processes
    if let Ok(mut child_slot) = shell.child.lock() {
        if let Some(child) = child_slot.as_mut() {
            kill_child_tree(child);
        }
    }

    if let Some(pid) = shell.pid {
        kill_process_tree(pid);
    }
}

fn kill_child_tree(child: &mut Child) {
    #[cfg(target_os = "windows")]
    if let Some(pid) = child.id() {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(0x08000000)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
    }

    let _ = child.start_kill();
}

async fn read_stream<R: tokio::io::AsyncRead + Unpin>(
    reader: R,
    stream: &'static str,
    shell_id: &str,
    broadcaster: Option<&crate::SseBroadcaster>,
    registry: Arc<Mutex<ShellRegistry>>,
) {
    let mut lines = BufReader::new(reader).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let chunk = format!("{line}\n");
        if let Ok(mut reg) = registry.lock() {
            if let Some(shell) = reg.shells.get_mut(shell_id) {
                if stream == "stdout" {
                    shell.stdout.push_str(&chunk);
                } else {
                    shell.stderr.push_str(&chunk);
                }
            }
        }

        if let Some(b) = broadcaster {
            let _ = b.emit_event(
                &format!("shell-{shell_id}"),
                &crate::AgentSseEvent::ShellOutput {
                    shell_id: shell_id.to_string(),
                    stream: stream.to_string(),
                    data: chunk,
                },
            );
        }
    }
}

async fn wait_for_child(
    registry: Arc<Mutex<ShellRegistry>>,
    shell_id: String,
    broadcaster: Option<Arc<crate::SseBroadcaster>>,
    child_slot: Arc<Mutex<Option<Child>>>,
) {
    let child = {
        let mut slot = child_slot.lock().expect("child slot lock");
        slot.take()
    };

    let Some(mut child) = child else {
        return;
    };

    let result = child.wait().await;
    let (status, exit_code) = match result {
        Ok(exit_status) => {
            let code = exit_status.code();
            let shell_status = if exit_status.success() {
                ShellStatus::Completed
            } else {
                ShellStatus::Failed
            };
            (shell_status, code)
        }
        Err(_) => (ShellStatus::Failed, None),
    };

    if let Ok(mut reg) = registry.lock() {
        if let Some(shell) = reg.shells.get_mut(&shell_id) {
            if shell.status == ShellStatus::Running
                || shell.status == ShellStatus::Timeout
            {
                shell.status = status;
                shell.exit_code = exit_code;
            }
        }
    }

    // Emit the full ShellOutput so the frontend can update UI in real time.
    if let Ok(reg) = registry.lock() {
        if let Ok(output) = reg.snapshot_output(&shell_id) {
            if let Some(b) = &broadcaster {
                let _ = b.emit_event(
                    &format!("shell-{shell_id}"),
                    &crate::AgentSseEvent::ShellFinished {
                        shell_id: shell_id.clone(),
                        output,
                    },
                );
            }
        }
    }
}

fn kill_process_tree(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(0x08000000)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
    }
}

// ---------------------------------------------------------------------------
// Plain public wrapper functions (no Tauri dependency)
// ---------------------------------------------------------------------------

pub async fn tool_shell(
    registry: Arc<Mutex<ShellRegistry>>,
    broadcaster: Option<Arc<crate::SseBroadcaster>>,
    workspace_dir: String,
    command: String,
    description: Option<String>,
    working_directory: Option<String>,
    block_until_ms: Option<u64>,
    task_id: Option<String>,
) -> Result<ShellOutput, String> {
    ShellRegistry::run_shell(
        registry,
        broadcaster,
        workspace_dir,
        command,
        description,
        working_directory,
        block_until_ms,
        task_id,
    )
    .await
}

/// Execute a command on a remote target via SSH, with streaming output.
/// Returns immediately with a `remote-` shell_id when `block_until_ms` is 0,
/// or blocks up to `block_until_ms` then returns current output (background mode).
/// Supports `await` / `read_shell_logs` / `kill_shell` via `ShellRegistry`.
pub async fn tool_remote_shell(
    registry: Arc<Mutex<ShellRegistry>>,
    remote_pool: &RemoteConnectionPool,
    broadcaster: Option<Arc<crate::SseBroadcaster>>,
    command: String,
    description: Option<String>,
    config: super::remote_connection::RemoteTargetConfig,
    block_until_ms: Option<u64>,
    task_id: Option<String>,
) -> Result<ShellOutput, String> {
    use super::remote_connection::SshStreamEvent;

    let started_at = Instant::now();
    let alias = config.alias.clone();
    let desc = description.clone();
    let cmd = command.clone();
    let block_ms = normalize_block_until_ms(block_until_ms);

    let shell_id = format!(
        "remote-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    );

    // --- Build a temporary connection pool to get/create the session ---
    let sessions_arc = remote_pool.sessions.clone();
    let get_session = {
        let sessions = sessions_arc.clone();
        let cfg = config.clone();
        let alias_c = alias.clone();
        move || -> Result<Arc<super::remote_connection::SshSession>, String> {
            let pool = super::remote_connection::RemoteConnectionPool {
                sessions: sessions.clone(),
            };
            pool.get_or_connect(&alias_c, &cfg)
        }
    };

    let session = get_session().map_err(|e| format!("Remote exec failed: {e}"))?;

    // --- Kill flag shared between Registry and SSH reader thread ---
    let killed = Arc::new(AtomicBool::new(false));
    let killed_reader = killed.clone();

    // --- Register running shell ---
    {
        let mut reg = registry.lock().map_err(|_| "Shell registry lock poisoned")?;
        reg.shells.insert(
            shell_id.clone(),
            RunningShell {
                command: cmd.clone(),
                description: desc.clone(),
                working_directory: format!("remote:{}", alias),
                stdout: String::new(),
                stderr: String::new(),
                status: ShellStatus::Running,
                exit_code: None,
                started_at,
                task_id: task_id.clone(),
                pid: None, // Remote shells have no local PID
                killed: killed.clone(),
                child: Arc::new(Mutex::new(None)),
                child_killer: None,
                source: "agent".to_string(),
            },
        );
    }

    // --- std mpsc channel: blocking SSH reader → blocking consumer ---
    let (tx, rx) = std::sync::mpsc::channel::<SshStreamEvent>();

    // --- Spawn blocking SSH reader ---
    let session_reader = session.clone();
    let cmd_reader = cmd.clone();
    tokio::task::spawn_blocking(move || {
        session_reader.exec_to_channel(&cmd_reader, &killed_reader, tx);
    });

    // --- Spawn blocking consumer: receives chunks → updates registry + emits events ---
    let registry_consumer = registry.clone();
    let broadcaster_consumer = broadcaster.clone();
    let sid = shell_id.clone();
    tokio::task::spawn_blocking(move || {
        loop {
            let Ok(event) = rx.recv() else {
                // All senders dropped, stream ended
                break;
            };
            match event {
                SshStreamEvent::Stdout(data) => {
                    let chunk = String::from_utf8_lossy(&data).to_string();
                    if let Ok(mut reg) = registry_consumer.lock() {
                        if let Some(s) = reg.shells.get_mut(&sid) {
                            s.stdout.push_str(&chunk);
                        }
                    }
                    if let Some(b) = &broadcaster_consumer {
                        let _ = b.emit_event(
                            &format!("shell-{sid}"),
                            &crate::AgentSseEvent::ShellOutput {
                                shell_id: sid.clone(),
                                stream: "stdout".to_string(),
                                data: chunk,
                            },
                        );
                    }
                }
                SshStreamEvent::Stderr(data) => {
                    let chunk = String::from_utf8_lossy(&data).to_string();
                    if let Ok(mut reg) = registry_consumer.lock() {
                        if let Some(s) = reg.shells.get_mut(&sid) {
                            s.stderr.push_str(&chunk);
                        }
                    }
                    if let Some(b) = &broadcaster_consumer {
                        let _ = b.emit_event(
                            &format!("shell-{sid}"),
                            &crate::AgentSseEvent::ShellOutput {
                                shell_id: sid.clone(),
                                stream: "stderr".to_string(),
                                data: chunk,
                            },
                        );
                    }
                }
                SshStreamEvent::ExitCode(code) => {
                    if let Ok(mut reg) = registry_consumer.lock() {
                        if let Some(s) = reg.shells.get_mut(&sid) {
                            if s.status == ShellStatus::Running {
                                s.status = if code == Some(0) {
                                    ShellStatus::Completed
                                } else {
                                    ShellStatus::Failed
                                };
                                s.exit_code = code;
                            }
                        }
                    }
                    if let Ok(reg) = registry_consumer.lock() {
                        if let Ok(output) = reg.snapshot_output(&sid) {
                            if let Some(b) = &broadcaster_consumer {
                                let _ = b.emit_event(
                                    &format!("shell-{sid}"),
                                    &crate::AgentSseEvent::ShellFinished {
                                        shell_id: sid.clone(),
                                        output,
                                    },
                                );
                            }
                        }
                    }
                }
                SshStreamEvent::Killed => {
                    if let Ok(mut reg) = registry_consumer.lock() {
                        if let Some(s) = reg.shells.get_mut(&sid) {
                            if s.status == ShellStatus::Running {
                                s.status = ShellStatus::Cancelled;
                            }
                        }
                    }
                    if let Ok(reg) = registry_consumer.lock() {
                        if let Ok(output) = reg.snapshot_output(&sid) {
                            if let Some(b) = &broadcaster_consumer {
                                let _ = b.emit_event(
                                    &format!("shell-{sid}"),
                                    &crate::AgentSseEvent::ShellFinished {
                                        shell_id: sid.clone(),
                                        output,
                                    },
                                );
                            }
                        }
                    }
                }
                SshStreamEvent::Error(msg) => {
                    if let Ok(mut reg) = registry_consumer.lock() {
                        if let Some(s) = reg.shells.get_mut(&sid) {
                            s.stderr.push_str(&msg);
                            if s.status == ShellStatus::Running {
                                s.status = ShellStatus::Failed;
                            }
                        }
                    }
                    if let Ok(reg) = registry_consumer.lock() {
                        if let Ok(output) = reg.snapshot_output(&sid) {
                            if let Some(b) = &broadcaster_consumer {
                                let _ = b.emit_event(
                                    &format!("shell-{sid}"),
                                    &crate::AgentSseEvent::ShellFinished {
                                        shell_id: sid.clone(),
                                        output,
                                    },
                                );
                            }
                        }
                    }
                }
            }
        }
    });

    // --- Return ShellOutput with shell_id ---
    let output = build_shell_output(
        cmd,
        desc,
        format!("remote:{}", alias),
        "",
        "",
        None,
        started_at,
        ShellStatus::Running,
        Some(shell_id.clone()),
        "agent".to_string(),
    );

    if block_ms == 0 {
        return Ok(output);
    }

    // --- Blocking mode: await ---
    ShellRegistry::await_shell_shared(registry, shell_id, Some(block_ms), true).await
}

pub async fn tool_await(
    registry: Arc<Mutex<ShellRegistry>>,
    shell_id: String,
    block_until_ms: Option<u64>,
) -> Result<ShellOutput, String> {
    ShellRegistry::await_shell_shared(registry, shell_id, block_until_ms, false).await
}

pub fn shell_kill(registry: &Mutex<ShellRegistry>, shell_id: String) -> Result<(), String> {
    let mut reg = registry.lock().map_err(|_| "Shell registry lock poisoned")?;
    reg.kill(&shell_id)
}

pub fn shell_kill_by_task(registry: &Mutex<ShellRegistry>, task_id: String) -> Result<u32, String> {
    let mut reg = registry.lock().map_err(|_| "Shell registry lock poisoned")?;
    Ok(reg.kill_by_task(&task_id) as u32)
}

pub fn shell_list(
    registry: &Mutex<ShellRegistry>,
    status_filter: Option<ShellStatusFilter>,
) -> Result<Vec<ShellInfo>, String> {
    let reg = registry.lock().map_err(|_| "Shell registry lock poisoned")?;
    Ok(reg.list(status_filter.unwrap_or(ShellStatusFilter::Running)))
}

pub fn shell_read_logs(
    registry: &Mutex<ShellRegistry>,
    shell_id: String,
    stream: Option<String>,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<ReadShellLogsResponse, String> {
    let reg = registry.lock().map_err(|_| "Shell registry lock poisoned")?;
    reg.read_shell_logs(&shell_id, stream, offset, limit)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_shell(status: ShellStatus) -> RunningShell {
        RunningShell {
            command: "echo test".to_string(),
            description: Some("test shell".to_string()),
            working_directory: "/workspace".to_string(),
            stdout: String::new(),
            stderr: String::new(),
            status,
            exit_code: None,
            started_at: Instant::now(),
            task_id: Some("task-1".to_string()),
            pid: None,
            killed: Arc::new(AtomicBool::new(false)),
            child: Arc::new(Mutex::new(None)),
            child_killer: None,
            source: "agent".to_string(),
        }
    }

    #[test]
    fn list_filters_by_status() {
        let mut registry = ShellRegistry::new();
        registry.shells.insert(
            "shell-running".to_string(),
            test_shell(ShellStatus::Running),
        );
        registry.shells.insert(
            "shell-completed".to_string(),
            test_shell(ShellStatus::Completed),
        );

        let running = registry.list(ShellStatusFilter::Running);
        assert_eq!(running.len(), 1);
        assert_eq!(running[0].shell_id, "shell-running");

        let all = registry.list(ShellStatusFilter::All);
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn kill_only_allows_running_shells() {
        let mut registry = ShellRegistry::new();
        registry.shells.insert(
            "shell-completed".to_string(),
            test_shell(ShellStatus::Completed),
        );
        registry.shells.insert(
            "shell-running".to_string(),
            test_shell(ShellStatus::Running),
        );

        let error = registry
            .kill("shell-completed")
            .expect_err("completed shell should not be killable");
        assert_eq!(
            error,
            "Only running or timed-out shells can be killed: shell-completed is completed"
        );

        registry
            .kill("shell-running")
            .expect("running shell should be killable");
        assert_eq!(
            registry
                .shells
                .get("shell-running")
                .map(|shell| shell.status),
            Some(ShellStatus::Cancelled)
        );
    }

    #[test]
    fn kill_by_task_cancels_timeout_shells() {
        let mut registry = ShellRegistry::new();
        let mut shell = test_shell(ShellStatus::Timeout);
        shell.task_id = Some("task-1".to_string());
        registry.shells.insert("shell-timeout".to_string(), shell);

        let killed = registry.kill_by_task("task-1");
        assert_eq!(killed, 1);
        assert_eq!(
            registry.shells.get("shell-timeout").map(|entry| entry.status),
            Some(ShellStatus::Cancelled)
        );
        assert!(
            registry
                .shells
                .get("shell-timeout")
                .unwrap()
                .killed
                .load(std::sync::atomic::Ordering::SeqCst),
            "kill flag should be set"
        );
    }

    #[test]
    fn read_shell_logs_does_not_panic_on_utf8_boundaries() {
        let mut registry = ShellRegistry::new();
        let mut shell = test_shell(ShellStatus::Running);
        shell.stdout = "x".repeat(4090) + "你好";
        registry.shells.insert("shell-1".to_string(), shell);

        let response = registry
            .read_shell_logs("shell-1", None, Some(0), Some(4096))
            .expect("read should succeed");

        assert!(response.data.is_char_boundary(response.data.len()));
        assert!(response.offset + response.data.len() <= response.total_bytes);
    }
}
