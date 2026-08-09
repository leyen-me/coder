use chrono::{Local, NaiveDate};
use std::error::Error;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

static STREAM_LOG_FILE: OnceLock<Mutex<CachedLogFile>> = OnceLock::new();
static DIAGNOSTIC_LOG_FILE: OnceLock<Mutex<CachedLogFile>> = OnceLock::new();

const LOG_RETENTION_DAYS: i64 = 14;

struct CachedLogFile {
    path: PathBuf,
    file: std::fs::File,
}

fn log_file_path(name: &str) -> PathBuf {
    crate::get_coder_logs_dir()
        .join(current_log_date_dir_name())
        .join(name)
}

fn current_log_date_dir_name() -> String {
    Local::now().format("%Y-%m-%d").to_string()
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

impl CachedLogFile {
    fn open(path: &Path) -> Self {
        Self {
            path: path.to_path_buf(),
            file: open_log_file(path),
        }
    }
}

fn write_to_log(
    file_slot: &OnceLock<Mutex<CachedLogFile>>,
    path: PathBuf,
    prefix: &str,
    message: &str,
) {
    let file = file_slot.get_or_init(|| Mutex::new(CachedLogFile::open(&path)));

    if let Ok(mut writer) = file.lock() {
        if writer.path != path {
            *writer = CachedLogFile::open(&path);
        }
        let _ = writeln!(writer.file, "{prefix} {message}");
        let _ = writer.file.flush();
    }
}

fn write_stream_log(message: &str) {
    write_to_log(
        &STREAM_LOG_FILE,
        log_file_path("agent-stream-rs.log"),
        "[agent-stream-rs]",
        message,
    );
}

fn write_diagnostic_log(message: &str) {
    write_to_log(
        &DIAGNOSTIC_LOG_FILE,
        log_file_path("agent-diagnostic.log"),
        "[agent-diagnostic]",
        message,
    );
}

/// Agent stream file logging is opt-in. Written to `~/.coder/logs/agent-stream-rs.log`.
const AGENT_STREAM_LOG_ENABLED: bool = false;
/// Diagnostic stream lifecycle logging is opt-in. Written to `~/.coder/logs/agent-diagnostic.log`.
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

pub fn agent_diagnostic_file_log(message: impl AsRef<str>) {
    write_diagnostic_log(message.as_ref());
}

pub fn cleanup_agent_log_dirs() -> Result<(), String> {
    let logs_dir = crate::get_coder_logs_dir();
    if !logs_dir.exists() {
        return Ok(());
    }

    let today = Local::now().date_naive();
    let entries = fs::read_dir(&logs_dir)
        .map_err(|error| format!("failed to read logs dir {}: {error}", logs_dir.display()))?;

    for entry in entries {
        let entry = entry.map_err(|error| format!("failed to read logs dir entry: {error}"))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        let Ok(date) = NaiveDate::parse_from_str(name, "%Y-%m-%d") else {
            continue;
        };

        if (today - date).num_days() > LOG_RETENTION_DAYS {
            fs::remove_dir_all(&path).map_err(|error| {
                format!("failed to remove old logs dir {}: {error}", path.display())
            })?;
        }
    }

    Ok(())
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
    if trimmed.chars().count() <= 160 {
        return trimmed.to_string();
    }
    format!(
        "{}... (len={})",
        preview_for_log(trimmed, 160),
        trimmed.len()
    )
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_url_for_log_does_not_panic_on_multibyte_boundary() {
        let url = format!("https://example.com/{}", "测".repeat(200));
        let sanitized = sanitize_url_for_log(&url);
        assert!(sanitized.contains("(len="));
        assert!(sanitized.chars().count() < url.chars().count());
    }

    #[test]
    fn log_file_path_uses_coder_logs_dir() {
        let path = log_file_path("agent-diagnostic.log");

        // Ends with the requested file name — assert on the Path, not on a
        // hard-coded "/" separator, so this works on both Windows and Unix.
        assert_eq!(
            path.file_name().and_then(|name| name.to_str()),
            Some("agent-diagnostic.log")
        );

        // Lives under the coder logs root.
        let logs_dir = crate::get_coder_logs_dir();
        assert!(path.starts_with(&logs_dir));

        // With a dated YYYY-MM-DD sub-directory in between.
        let date_dir = path.parent().and_then(Path::file_name).and_then(|name| name.to_str());
        assert_eq!(date_dir.map(str::len), Some(10));
        assert!(date_dir.is_some_and(|name| name.chars().all(|ch| ch == '-' || ch.is_ascii_digit())));
    }

    #[test]
    fn current_log_date_dir_name_uses_yyyy_mm_dd() {
        let value = current_log_date_dir_name();
        assert_eq!(value.len(), 10);
        assert!(NaiveDate::parse_from_str(&value, "%Y-%m-%d").is_ok());
    }
}
