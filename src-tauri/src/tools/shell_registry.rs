use std::collections::HashMap;
use std::io::Read;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use std::thread;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tauri::{AppHandle, Emitter, State};
use tokio::time::{sleep, Duration};

const POST_KILL_WAIT_MS: u64 = 3_000;

use super::shell::{
    build_shell_output, normalize_block_until_ms, resolve_command_shell, resolve_working_directory,
    shell_command_builder, ReadShellLogsResponse, ShellInfo, ShellOutput, ShellOutputEvent,
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
    child_killer: Option<Box<dyn portable_pty::ChildKiller + Send + Sync>>,
    source: String,
}

pub struct ShellRegistry {
    shells: HashMap<String, RunningShell>,
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

        if shell.status == ShellStatus::Running {
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

        if shell.status != ShellStatus::Running {
            return Err(format!(
                "Only running shells can be killed: {shell_id} is {}",
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
        app: &AppHandle,
        workspace_dir: String,
        command: String,
        description: Option<String>,
        working_directory: Option<String>,
        block_until_ms: Option<u64>,
        task_id: Option<String>,
    ) -> Result<ShellOutput, String> {
        let cwd = resolve_working_directory(&workspace_dir, working_directory.as_deref())?;
        let cwd_display = cwd.to_string_lossy().replace('\\', "/");
        let block_ms = normalize_block_until_ms(block_until_ms);

        let output = Self::spawn_background(
            registry.clone(),
            app.clone(),
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

                let reg = registry
                    .lock()
                    .map_err(|_| "Shell registry lock poisoned")?;
                let mut output = reg.snapshot_output(&shell_id)?;
                output.status = ShellStatus::Timeout;
                return Ok(output);
            }

            sleep(Duration::from_millis(100)).await;
        }
    }

    async fn spawn_background(
        registry: Arc<Mutex<ShellRegistry>>,
        app: AppHandle,
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

        // Create a PTY to run the command
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 100,
                cols: 120,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| format!("Failed to open PTY: {error}"))?;

        let mut cmd = CommandBuilder::new(&program);
        for arg in &args {
            cmd.arg(arg);
        }
        cmd.cwd(&cwd);
        for (key, value) in &environment {
            cmd.env(key, value);
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|error| format!("Failed to spawn command in PTY: {error}"))?;

        let killed = Arc::new(AtomicBool::new(false));
        let killed_reader = killed.clone();

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
                    pid: None,
                    killed,
                    child_killer: None,
                    source: "agent".to_string(),
                },
            );
        }

        let shell_id_reader = shell_id.clone();
        let registry_reader = registry.clone();
        let app_reader = app.clone();
        let mut child_killer = child.clone_killer();

        // Spawn a blocking thread to read from PTY master
        thread::spawn(move || {
            let mut reader = match pair.master.try_clone_reader() {
                Ok(reader) => reader,
                Err(_) => return,
            };

            let mut buf = [0u8; 4096];
            loop {
                if killed_reader.load(Ordering::SeqCst) {
                    break;
                }

                match reader.read(&mut buf) {
                    Ok(0) => break, // EOF — command finished
                    Ok(count) => {
                        let data = String::from_utf8_lossy(&buf[..count]).to_string();

                        if let Ok(mut reg) = registry_reader.lock() {
                            if let Some(shell) = reg.shells.get_mut(&shell_id_reader) {
                                shell.stdout.push_str(&data);
                            }
                        }

                        let _ = app_reader.emit(
                            "shell-output",
                            ShellOutputEvent {
                                shell_id: shell_id_reader.clone(),
                                stream: "stdout".to_string(),
                                data,
                            },
                        );
                    }
                    Err(_) => break,
                }
            }

            // Clean up child process
            let _ = child_killer.kill();

            // Mark as completed
            if let Ok(mut reg) = registry_reader.lock() {
                if let Some(shell) = reg.shells.get_mut(&shell_id_reader) {
                    if shell.status == ShellStatus::Running {
                        shell.status = ShellStatus::Completed;
                        shell.exit_code = Some(0);
                    }
                }
            }

            let _ = app_reader.emit(
                "shell-finished",
                serde_json::json!({
                    "shellId": shell_id_reader,
                    "exitCode": 0,
                    "status": "completed",
                }),
            );
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
        let data = if offset >= total_bytes {
            String::new()
        } else {
            let end = (offset + limit).min(total_bytes);
            content[offset..end].to_string()
        };

        Ok(super::shell::ReadShellLogsResponse {
            shell_id: shell_id.to_string(),
            stream,
            data,
            offset,
            total_bytes,
            truncated: offset + limit < total_bytes,
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

    // Use child_killer first if available (e.g. human PTY sessions)
    if let Some(killer) = shell.child_killer.as_mut() {
        let _ = killer.kill();
    }

    if let Some(pid) = shell.pid {
        kill_process_tree(pid);
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

pub struct ShellState(pub Arc<Mutex<ShellRegistry>>);

#[tauri::command]
pub async fn tool_shell(
    app: AppHandle,
    state: State<'_, ShellState>,
    workspace_dir: String,
    command: String,
    description: Option<String>,
    working_directory: Option<String>,
    block_until_ms: Option<u64>,
    task_id: Option<String>,
) -> Result<ShellOutput, String> {
    ShellRegistry::run_shell(
        state.0.clone(),
        &app,
        workspace_dir,
        command,
        description,
        working_directory,
        block_until_ms,
        task_id,
    )
    .await
}

#[tauri::command]
pub async fn tool_await(
    state: State<'_, ShellState>,
    shell_id: String,
    block_until_ms: Option<u64>,
) -> Result<ShellOutput, String> {
    ShellRegistry::await_shell_shared(state.0.clone(), shell_id, block_until_ms, false).await
}

#[tauri::command]
pub fn shell_kill(state: State<'_, ShellState>, shell_id: String) -> Result<(), String> {
    let mut registry = state.0.lock().map_err(|_| "Shell registry lock poisoned")?;
    registry.kill(&shell_id)
}

#[tauri::command]
pub fn shell_kill_by_task(state: State<'_, ShellState>, task_id: String) -> Result<u32, String> {
    let mut registry = state.0.lock().map_err(|_| "Shell registry lock poisoned")?;
    Ok(registry.kill_by_task(&task_id) as u32)
}

#[tauri::command]
pub fn shell_list(
    state: State<'_, ShellState>,
    status_filter: Option<ShellStatusFilter>,
) -> Result<Vec<ShellInfo>, String> {
    let registry = state.0.lock().map_err(|_| "Shell registry lock poisoned")?;
    Ok(registry.list(status_filter.unwrap_or(ShellStatusFilter::Running)))
}

#[tauri::command]
pub fn shell_read_logs(
    state: State<'_, ShellState>,
    shell_id: String,
    stream: Option<String>,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<ReadShellLogsResponse, String> {
    let registry = state.0.lock().map_err(|_| "Shell registry lock poisoned")?;
    registry.read_shell_logs(&shell_id, stream, offset, limit)
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
            "Only running shells can be killed: shell-completed is completed"
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
}
