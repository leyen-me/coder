use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::task::JoinHandle;
use tokio::time::{sleep, timeout, Duration};

const POST_KILL_WAIT_MS: u64 = 3_000;
const PIPE_DRAIN_GRACE_MS: u64 = 2_000;

use super::shell::{
    build_shell_output, normalize_block_until_ms, resolve_command_shell,
    resolve_working_directory, shell_command_builder, ShellInfo, ShellOutput,
    ShellOutputEvent, ShellStatus,
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
    child: Arc<Mutex<Option<Child>>>,
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

    pub fn list(&self) -> Vec<ShellInfo> {
        self.shells
            .iter()
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
            })
            .collect()
    }

    pub fn kill(&mut self, shell_id: &str) -> Result<(), String> {
        let shell = self
            .shells
            .get_mut(shell_id)
            .ok_or_else(|| format!("Unknown shell_id: {shell_id}"))?;

        if shell.status == ShellStatus::Running {
            if let Ok(mut child_slot) = shell.child.lock() {
                if let Some(child) = child_slot.as_mut() {
                    let _ = child.start_kill();
                }
            }
            shell.status = ShellStatus::Cancelled;
        }
        Ok(())
    }

    pub fn kill_by_task(&mut self, task_id: &str) -> usize {
        let ids: Vec<String> = self
            .shells
            .iter()
            .filter_map(|(id, shell)| {
                if shell.task_id.as_deref() == Some(task_id)
                    && shell.status == ShellStatus::Running
                {
                    Some(id.clone())
                } else {
                    None
                }
            })
            .collect();

        let mut killed = 0;
        for id in ids {
            if self.kill(&id).is_ok() {
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

        if block_ms == 0 {
            return Self::spawn_background(
                registry,
                app.clone(),
                command,
                description,
                cwd,
                cwd_display,
                task_id,
            )
            .await;
        }

        Self::run_blocking(command, description, cwd, cwd_display, block_ms).await
    }

    pub async fn await_shell_shared(
        registry: Arc<Mutex<ShellRegistry>>,
        shell_id: String,
        block_until_ms: Option<u64>,
    ) -> Result<ShellOutput, String> {
        {
            let reg = registry.lock().map_err(|_| "Shell registry lock poisoned")?;
            if !reg.shells.contains_key(&shell_id) {
                return Err(format!("Unknown shell_id: {shell_id}"));
            }
        }

        let block_ms = normalize_block_until_ms(block_until_ms);
        let deadline = Instant::now() + Duration::from_millis(block_ms);

        loop {
            let status = {
                let reg = registry.lock().map_err(|_| "Shell registry lock poisoned")?;
                reg.shells
                    .get(&shell_id)
                    .map(|shell| shell.status)
                    .ok_or_else(|| format!("Unknown shell_id: {shell_id}"))?
            };

            if status != ShellStatus::Running {
                let reg = registry.lock().map_err(|_| "Shell registry lock poisoned")?;
                return reg.snapshot_output(&shell_id);
            }

            if Instant::now() >= deadline {
                let mut reg = registry.lock().map_err(|_| "Shell registry lock poisoned")?;
                if let Some(shell) = reg.shells.get_mut(&shell_id) {
                    shell.status = ShellStatus::Timeout;
                }
                return reg.snapshot_output(&shell_id);
            }

            sleep(Duration::from_millis(100)).await;
        }
    }

    async fn run_blocking(
        command: String,
        description: Option<String>,
        cwd: PathBuf,
        cwd_display: String,
        block_ms: u64,
    ) -> Result<ShellOutput, String> {
        let started_at = Instant::now();
        let shell = resolve_command_shell();
        let (program, args) = shell_command_builder(&shell, &command);

        let mut cmd = Command::new(&program);
        cmd.args(args).current_dir(&cwd);
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());
        cmd.kill_on_drop(true);

        let mut child = cmd
            .spawn()
            .map_err(|error| format!("Failed to spawn command: {error}"))?;

        let stdout_pipe = child.stdout.take();
        let stderr_pipe = child.stderr.take();
        let stdout_acc = Arc::new(Mutex::new(String::new()));
        let stderr_acc = Arc::new(Mutex::new(String::new()));

        let stdout_reader = tokio::spawn(read_pipe_to_buffer(
            stdout_pipe,
            stdout_acc.clone(),
        ));
        let stderr_reader = tokio::spawn(read_pipe_to_buffer(
            stderr_pipe,
            stderr_acc.clone(),
        ));

        let wait_result = timeout(Duration::from_millis(block_ms), child.wait()).await;

        let (status, exit_code) = match wait_result {
            Ok(Ok(exit_status)) => {
                let code = exit_status.code();
                let status = if exit_status.success() {
                    ShellStatus::Completed
                } else {
                    ShellStatus::Failed
                };
                (status, code)
            }
            Ok(Err(_)) => (ShellStatus::Failed, None),
            Err(_) => {
                kill_child_tree(&mut child);
                wait_for_child_exit(&mut child, POST_KILL_WAIT_MS).await;
                (ShellStatus::Timeout, None)
            }
        };

        drain_pipe_readers(stdout_reader, stderr_reader, PIPE_DRAIN_GRACE_MS).await;

        let stdout = stdout_acc
            .lock()
            .map(|buffer| buffer.clone())
            .unwrap_or_default();
        let stderr = stderr_acc
            .lock()
            .map(|buffer| buffer.clone())
            .unwrap_or_default();

        Ok(build_shell_output(
            command,
            description,
            cwd_display,
            &stdout,
            &stderr,
            exit_code,
            started_at,
            status,
            None,
        ))
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
            let reg = registry.lock().map_err(|_| "Shell registry lock poisoned")?;
            reg.next_shell_id()
        };
        let started_at = Instant::now();
        let shell = resolve_command_shell();
        let (program, args) = shell_command_builder(&shell, &command);

        let mut cmd = Command::new(&program);
        cmd.args(args).current_dir(&cwd);
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());
        cmd.kill_on_drop(true);

        let mut child = cmd
            .spawn()
            .map_err(|error| format!("Failed to spawn command: {error}"))?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let child_slot = Arc::new(Mutex::new(Some(child)));

        {
            let mut reg = registry.lock().map_err(|_| "Shell registry lock poisoned")?;
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
                    child: child_slot.clone(),
                },
            );
        }

        let shell_id_stdout = shell_id.clone();
        let shell_id_stderr = shell_id.clone();
        let registry_stdout = registry.clone();
        let registry_stderr = registry.clone();
        let app_stdout = app.clone();
        let app_stderr = app.clone();

        if let Some(stdout) = stdout {
            tokio::spawn(async move {
                read_stream(
                    stdout,
                    "stdout",
                    &shell_id_stdout,
                    &app_stdout,
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
                    &app_stderr,
                    registry_stderr,
                )
                .await;
            });
        }

        let registry_wait = registry.clone();
        let shell_id_wait = shell_id.clone();
        let app_wait = app.clone();
        tokio::spawn(async move {
            wait_for_child(registry_wait, shell_id_wait, app_wait, child_slot).await;
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
        ))
    }
}

fn kill_child_tree(child: &mut Child) {
    #[cfg(target_os = "windows")]
    if let Some(pid) = child.id() {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
    }

    let _ = child.start_kill();
}

async fn wait_for_child_exit(child: &mut Child, max_ms: u64) {
    let _ = timeout(Duration::from_millis(max_ms), child.wait()).await;
}

async fn drain_pipe_readers(
    stdout_reader: JoinHandle<()>,
    stderr_reader: JoinHandle<()>,
    grace_ms: u64,
) {
    let stdout_abort = stdout_reader.abort_handle();
    let stderr_abort = stderr_reader.abort_handle();

    if timeout(
        Duration::from_millis(grace_ms),
        async {
            let _ = tokio::join!(stdout_reader, stderr_reader);
        },
    )
    .await
    .is_err()
    {
        stdout_abort.abort();
        stderr_abort.abort();
    }
}

async fn read_pipe_to_buffer<R: tokio::io::AsyncRead + Unpin>(
    reader: Option<R>,
    buffer: Arc<Mutex<String>>,
) {
    let Some(reader) = reader else {
        return;
    };

    let mut lines = BufReader::new(reader).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let chunk = format!("{line}\n");
        if let Ok(mut acc) = buffer.lock() {
            acc.push_str(&chunk);
        }
    }
}

async fn read_stream<R: tokio::io::AsyncRead + Unpin>(
    reader: R,
    stream: &'static str,
    shell_id: &str,
    app: &AppHandle,
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

        let _ = app.emit(
            "shell-output",
            ShellOutputEvent {
                shell_id: shell_id.to_string(),
                stream: stream.to_string(),
                data: chunk,
            },
        );
    }
}

async fn wait_for_child(
    registry: Arc<Mutex<ShellRegistry>>,
    shell_id: String,
    app: AppHandle,
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
            let status = if exit_status.success() {
                ShellStatus::Completed
            } else {
                ShellStatus::Failed
            };
            (status, code)
        }
        Err(_) => (ShellStatus::Failed, None),
    };

    if let Ok(mut reg) = registry.lock() {
        if let Some(shell) = reg.shells.get_mut(&shell_id) {
            if shell.status == ShellStatus::Running {
                shell.status = status;
                shell.exit_code = exit_code;
            }
        }
    }

    let _ = app.emit(
        "shell-finished",
        serde_json::json!({
            "shellId": shell_id,
            "exitCode": exit_code,
            "status": status,
        }),
    );
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
    ShellRegistry::await_shell_shared(state.0.clone(), shell_id, block_until_ms).await
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
pub fn shell_list(state: State<'_, ShellState>) -> Result<Vec<ShellInfo>, String> {
    let registry = state.0.lock().map_err(|_| "Shell registry lock poisoned")?;
    Ok(registry.list())
}
