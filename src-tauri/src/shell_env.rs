//! Loads environment variables from the user's login/interactive shell.
//!
//! GUI apps on macOS do not inherit `.zshrc` / `.zprofile`. Spawning a login
//! shell at startup bridges that gap for `apiKeySource: "env"` settings.

use std::collections::HashMap;
use std::sync::OnceLock;

static SHELL_ENV: OnceLock<HashMap<String, String>> = OnceLock::new();

/// Warm the shell environment cache during app startup.
pub fn preload_shell_environment() {
    let env = shell_environment();
    log::info!("loaded {} variable(s) from login shell environment", env.len());
}

/// Build the environment used for spawned commands and PTY shells.
///
/// Start with the current process environment, then overlay variables resolved
/// from the user's login shell so GUI-launched apps inherit the same PATH and
/// exported variables as a regular terminal session.
pub fn command_environment() -> HashMap<String, String> {
    merge_environments(std::env::vars().collect(), shell_environment())
}

/// Environment for interactive PTY sessions backed by xterm.js.
///
/// Login-shell env dumps inherit `TERM=dumb` from non-TTY GUI parents, which
/// breaks line editing (backspace appears to move the cursor forward). Force
/// terminal metadata that matches the embedded xterm session instead.
pub fn pty_environment() -> HashMap<String, String> {
    let mut env = command_environment();
    apply_pty_terminal_overrides(&mut env);
    env
}

fn apply_pty_terminal_overrides(env: &mut HashMap<String, String>) {
    env.insert("TERM".to_string(), "xterm-256color".to_string());
    env.insert("COLORTERM".to_string(), "truecolor".to_string());
    env.remove("TERMCAP");
    env.remove("COLUMNS");
    env.remove("LINES");
}

/// Read an environment variable from the process environment, falling back to the
/// user's login shell profile (`.zshrc`, `.zprofile`, etc.).
pub fn get_env_var(key: &str) -> Option<String> {
    let key = key.trim();
    if key.is_empty() {
        return None;
    }

    if let Ok(value) = std::env::var(key) {
        if !value.is_empty() {
            return Some(value);
        }
    }

    shell_environment().get(key).cloned()
}

fn shell_environment() -> &'static HashMap<String, String> {
    SHELL_ENV.get_or_init(load_shell_environment)
}

fn merge_environments(
    mut base: HashMap<String, String>,
    overlay: &HashMap<String, String>,
) -> HashMap<String, String> {
    for (key, value) in overlay {
        if !value.is_empty() {
            base.insert(key.clone(), value.clone());
        }
    }

    base
}

fn load_shell_environment() -> HashMap<String, String> {
    #[cfg(target_os = "windows")]
    {
        return HashMap::new();
    }

    #[cfg(not(target_os = "windows"))]
    load_unix_shell_environment()
}

#[cfg(not(target_os = "windows"))]
fn load_unix_shell_environment() -> HashMap<String, String> {
    use std::process::Command;

    let shell = resolve_login_shell();
    let (flag, command) = shell_invocation(&shell);

    let output = match Command::new(&shell).arg(flag).arg(command).output() {
        Ok(output) if output.status.success() => output.stdout,
        Ok(output) => {
            log::warn!(
                "failed to load shell environment from {}: exit {:?}",
                shell,
                output.status.code()
            );
            return HashMap::new();
        }
        Err(error) => {
            log::warn!("failed to spawn login shell {shell}: {error}");
            return HashMap::new();
        }
    };

    if output.contains(&0) {
        parse_nul_delimited_env(&output)
    } else {
        parse_newline_delimited_env(&output)
    }
}

fn resolve_login_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| {
        if cfg!(target_os = "macos") {
            "/bin/zsh".to_string()
        } else {
            "/bin/sh".to_string()
        }
    })
}

fn shell_invocation(shell: &str) -> (&'static str, &'static str) {
    let name = shell.rsplit('/').next().unwrap_or(shell);
    match name {
        "fish" => ("-lc", "env -0 2>/dev/null; or env"),
        _ => ("-ilc", "env -0 2>/dev/null || env"),
    }
}

fn parse_nul_delimited_env(output: &[u8]) -> HashMap<String, String> {
    let mut map = HashMap::new();

    for entry in output.split(|byte| *byte == 0) {
        if let Some((key, value)) = parse_env_assignment(entry) {
            map.insert(key, value);
        }
    }

    map
}

fn parse_newline_delimited_env(output: &[u8]) -> HashMap<String, String> {
    let mut map = HashMap::new();

    for line in output.split(|byte| *byte == b'\n') {
        if let Some((key, value)) = parse_env_assignment(line) {
            map.insert(key, value);
        }
    }

    map
}

fn parse_env_assignment(bytes: &[u8]) -> Option<(String, String)> {
    let line = std::str::from_utf8(bytes).ok()?.trim_end_matches('\r');
    if line.is_empty() {
        return None;
    }

    let (key, value) = line.split_once('=')?;
    if key.is_empty() {
        return None;
    }

    Some((key.to_string(), value.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_nul_delimited_env_entries() {
        let input = b"DEEPSEEK_API_KEY=secret\0PATH=/usr/bin\0\0";

        let env = parse_nul_delimited_env(input);
        assert_eq!(env.get("DEEPSEEK_API_KEY"), Some(&"secret".to_string()));
        assert_eq!(env.get("PATH"), Some(&"/usr/bin".to_string()));
    }

    #[test]
    fn parses_newline_delimited_env_entries() {
        let input = b"DEEPSEEK_API_KEY=secret\nPATH=/usr/bin:/bin\n";
        let env = parse_newline_delimited_env(input);
        assert_eq!(env.get("DEEPSEEK_API_KEY"), Some(&"secret".to_string()));
    }

    #[test]
    fn preserves_equals_in_values() {
        let input = b"TOKEN=abc=def=ghi\n";
        let env = parse_newline_delimited_env(input);
        assert_eq!(env.get("TOKEN"), Some(&"abc=def=ghi".to_string()));
    }

    #[test]
    fn uses_fish_login_shell_invocation() {
        assert_eq!(
            shell_invocation("/opt/homebrew/bin/fish"),
            ("-lc", "env -0 2>/dev/null; or env")
        );
    }

    #[test]
    fn uses_login_interactive_shell_invocation_for_zsh() {
        assert_eq!(
            shell_invocation("/bin/zsh"),
            ("-ilc", "env -0 2>/dev/null || env")
        );
    }

    #[test]
    fn pty_environment_overrides_dumb_term_from_login_shell() {
        let mut env = HashMap::from([
            ("PATH".to_string(), "/usr/local/bin:/usr/bin:/bin".to_string()),
            ("TERM".to_string(), "dumb".to_string()),
            ("COLUMNS".to_string(), "80".to_string()),
            ("LINES".to_string(), "24".to_string()),
        ]);

        apply_pty_terminal_overrides(&mut env);

        assert_eq!(env.get("TERM"), Some(&"xterm-256color".to_string()));
        assert_eq!(env.get("COLORTERM"), Some(&"truecolor".to_string()));
        assert!(!env.contains_key("COLUMNS"));
        assert!(!env.contains_key("LINES"));
        assert_eq!(
            env.get("PATH"),
            Some(&"/usr/local/bin:/usr/bin:/bin".to_string())
        );
    }

    #[test]
    fn merges_shell_environment_over_process_environment() {
        let base = HashMap::from([
            ("PATH".to_string(), "/usr/bin:/bin".to_string()),
            ("TERM".to_string(), "xterm-256color".to_string()),
        ]);
        let overlay = HashMap::from([
            ("PATH".to_string(), "/usr/local/bin:/usr/bin:/bin".to_string()),
            ("NODE_ENV".to_string(), "development".to_string()),
            ("EMPTY".to_string(), String::new()),
        ]);

        let merged = merge_environments(base, &overlay);

        assert_eq!(
            merged.get("PATH"),
            Some(&"/usr/local/bin:/usr/bin:/bin".to_string())
        );
        assert_eq!(merged.get("TERM"), Some(&"xterm-256color".to_string()));
        assert_eq!(merged.get("NODE_ENV"), Some(&"development".to_string()));
        assert!(!merged.contains_key("EMPTY"));
    }
}
