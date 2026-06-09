use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

static LOG_FILE: OnceLock<Mutex<std::fs::File>> = OnceLock::new();

fn log_file_path() -> PathBuf {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let project_root = manifest_dir.parent().unwrap_or(&manifest_dir);
    project_root.join(".logs").join("agent-stream-rs.log")
}

fn write_log(message: &str) {
    let file = LOG_FILE.get_or_init(|| {
        let path = log_file_path();
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .unwrap_or_else(|error| {
                panic!(
                    "failed to open agent stream log at {}: {error}",
                    path.display()
                )
            });
        Mutex::new(file)
    });

    if let Ok(mut writer) = file.lock() {
        let _ = writeln!(writer, "[agent-stream-rs] {message}");
        let _ = writer.flush();
    }
}

pub fn agent_stream_log(message: impl AsRef<str>) {
    if cfg!(debug_assertions) {
        write_log(message.as_ref());
    }
}
