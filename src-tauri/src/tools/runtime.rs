use std::path::Path;
use std::time::{Duration, Instant};

use serde::Serialize;

use super::project_instructions::{load_workspace_agents_md, AgentsMdContent};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageInfo {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeEnvironmentResponse {
    pub os: String,
    pub shell: String,
    pub is_git_repository: bool,
    pub agents_md: Option<AgentsMdContent>,
    pub languages: Vec<LanguageInfo>,
}

#[tauri::command]
pub fn agent_get_runtime_environment(
    workspace_dir: Option<String>,
) -> Result<RuntimeEnvironmentResponse, String> {
    let trimmed_workspace = workspace_dir.as_deref().map(str::trim).unwrap_or("");
    let agents_md = if trimmed_workspace.is_empty() {
        None
    } else {
        load_workspace_agents_md(trimmed_workspace)?
    };

    Ok(RuntimeEnvironmentResponse {
        os: resolve_os(),
        shell: resolve_shell(),
        is_git_repository: workspace_dir
            .as_deref()
            .map(is_git_repository)
            .unwrap_or(false),
        agents_md,
        languages: resolve_installed_languages(),
    })
}

fn resolve_os() -> String {
    format!(
        "{} {} ({})",
        std::env::consts::OS,
        std::env::consts::ARCH,
        resolve_os_version()
    )
}

fn resolve_os_version() -> String {
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("sw_vers")
            .arg("-productVersion")
            .output();
        if let Ok(result) = output {
            if result.status.success() {
                return String::from_utf8_lossy(&result.stdout).trim().to_string();
            }
        }
    }

    std::env::consts::OS.to_string()
}

fn resolve_shell() -> String {
    resolve_shell_for_command()
}

pub fn resolve_shell_for_command() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| {
        if cfg!(target_os = "windows") {
            std::env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".to_string())
        } else {
            "/bin/sh".to_string()
        }
    })
}

fn is_git_repository(workspace_dir: &str) -> bool {
    let trimmed = workspace_dir.trim();
    if trimmed.is_empty() {
        return false;
    }

    Path::new(trimmed).join(".git").exists()
}

/// Common programming languages/compilers/runtimes to detect.
const LANGUAGES_TO_DETECT: &[(&str, &[&str])] = &[
    ("Node.js", &["node", "--version"]),
    ("Python", &["python3", "--version"]),
    ("Python 2", &["python", "--version"]),
    ("Java", &["java", "-version"]),
    ("Go", &["go", "version"]),
    ("Rust", &["rustc", "--version"]),
    ("C/C++ (GCC)", &["gcc", "--version"]),
    ("C/C++ (Clang)", &["clang", "--version"]),
    ("Ruby", &["ruby", "--version"]),
    ("PHP", &["php", "--version"]),
    ("Swift", &["swift", "--version"]),
    ("Kotlin", &["kotlin", "-version"]),
    ("Deno", &["deno", "--version"]),
    ("Bun", &["bun", "--version"]),
    ("Zig", &["zig", "version"]),
    ("Perl", &["perl", "--version"]),
    ("Elixir", &["elixir", "--version"]),
    (".NET", &["dotnet", "--version"]),
    ("Dart", &["dart", "--version"]),
    ("Julia", &["julia", "--version"]),
    ("R (lang)", &["R", "--version"]),
];

/// Overall deadline for language detection (wall-clock).
const DETECTION_DEADLINE: Duration = Duration::from_secs(8);

fn resolve_installed_languages() -> Vec<LanguageInfo> {
    /// Cache: detected once per process lifetime.
    static CACHE: std::sync::OnceLock<Vec<LanguageInfo>> = std::sync::OnceLock::new();

    CACHE
        .get_or_init(|| {
            let start = Instant::now();
            let (tx, rx) = std::sync::mpsc::channel::<LanguageInfo>();

            for &(name, args) in LANGUAGES_TO_DETECT {
                let tx = tx.clone();
                let name = name.to_string();
                let cmd = args[0].to_string();
                let cmd_args: Vec<String> =
                    args[1..].iter().map(|s| s.to_string()).collect();

                std::thread::spawn(move || {
                    match std::process::Command::new(&cmd)
                        .args(&cmd_args)
                        .output()
                    {
                        Ok(output) if output.status.success() => {
                            let stdout = String::from_utf8_lossy(&output.stdout);
                            let stderr = String::from_utf8_lossy(&output.stderr);
                            let combined = format!("{stdout}{stderr}");
                            let version = combined
                                .lines()
                                .next()
                                .unwrap_or("")
                                .trim()
                                .to_string();
                            if !version.is_empty() {
                                let _ = tx.send(LanguageInfo { name, version });
                            }
                        }
                        _ => {
                            // Command not found or failed — skip silently
                        }
                    }
                });
            }

            // Drop the original sender so the channel closes when all threads finish.
            drop(tx);

            let mut results: Vec<LanguageInfo> = Vec::new();
            while start.elapsed() < DETECTION_DEADLINE {
                match rx.recv_timeout(Duration::from_millis(50)) {
                    Ok(info) => results.push(info),
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
                }
            }

            results.sort_by(|a, b| a.name.cmp(&b.name));
            results
        })
        .clone()
}

/// Eagerly trigger language detection at app startup so the
/// [`OnceLock`] cache is populated before any session starts.
pub fn preload_languages() {
    resolve_installed_languages();
}
