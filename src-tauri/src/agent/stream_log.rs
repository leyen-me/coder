use std::error::Error;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

static STREAM_LOG_FILE: OnceLock<Mutex<std::fs::File>> = OnceLock::new();
static DIAGNOSTIC_LOG_FILE: OnceLock<Mutex<std::fs::File>> = OnceLock::new();

fn project_root() -> PathBuf {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir.parent().unwrap_or(&manifest_dir).to_path_buf()
}

fn log_file_path(name: &str) -> PathBuf {
    project_root().join(".logs").join(name)
}

fn open_log_file(path: &Path) -> std::fs::File {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .unwrap_or_else(|error| {
            panic!(
                "failed to open agent log at {}: {error}",
                path.display()
            )
        })
}

fn write_to_log(
    file_slot: &OnceLock<Mutex<std::fs::File>>,
    path: &Path,
    prefix: &str,
    message: &str,
) {
    let file = file_slot.get_or_init(|| Mutex::new(open_log_file(path)));

    if let Ok(mut writer) = file.lock() {
        let _ = writeln!(writer, "{prefix} {message}");
        let _ = writer.flush();
    }
}

fn write_stream_log(message: &str) {
    write_to_log(
        &STREAM_LOG_FILE,
        &log_file_path("agent-stream-rs.log"),
        "[agent-stream-rs]",
        message,
    );
}

fn write_diagnostic_log(message: &str) {
    write_to_log(
        &DIAGNOSTIC_LOG_FILE,
        &log_file_path("agent-diagnostic.log"),
        "[agent-diagnostic]",
        message,
    );
}

/// Agent stream file logging is opt-in. Set to `true` when debugging stream events.
const AGENT_STREAM_LOG_ENABLED: bool = false;
/// Diagnostic stream lifecycle logging is opt-in. Written to `.logs/agent-diagnostic.log`.
const AGENT_DIAGNOSTIC_LOG_ENABLED: bool = false;

pub fn agent_stream_log(message: impl AsRef<str>) {
    if AGENT_STREAM_LOG_ENABLED {
        write_stream_log(message.as_ref());
    }
}

pub fn agent_diagnostic_log(message: impl AsRef<str>) {
    if AGENT_DIAGNOSTIC_LOG_ENABLED {
        write_diagnostic_log(message.as_ref());
    }
}

pub fn format_error_chain(error: &(dyn Error + 'static)) -> String {
    let mut parts = Vec::new();
    let mut current: Option<&dyn Error> = Some(error);
    while let Some(err) = current {
        parts.push(err.to_string());
        current = err.source();
    }
    parts.join(" -> ")
}

pub fn sanitize_url_for_log(url: &str) -> String {
    let trimmed = url.trim();
    if trimmed.len() <= 160 {
        return trimmed.to_string();
    }
    format!("{}... (len={})", &trimmed[..160], trimmed.len())
}

pub fn preview_for_log(value: &str, limit: usize) -> String {
    let mut chars = value.chars();
    let preview: String = chars.by_ref().take(limit).collect();
    if chars.next().is_some() {
        format!("{preview}...")
    } else {
        preview
    }
}
