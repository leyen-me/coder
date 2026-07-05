use std::path::Path;
use std::process::Command;

pub fn open_in_explorer(path: &str) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("path is required".to_string());
    }

    let metadata = std::fs::metadata(trimmed)
        .map_err(|error| format!("Path not found: {error}"))?;
    if !metadata.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let canonical = Path::new(trimmed)
        .canonicalize()
        .map_err(|error| format!("Path not found: {error}"))?;
    let path_arg = canonical.to_string_lossy().into_owned();

    spawn_file_manager(&path_arg).map_err(|error| format!("Failed to open file manager: {error}"))
}

fn spawn_file_manager(path: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", unix)))]
    {
        let _ = path;
        Err("Opening in file explorer is not supported on this platform".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::open_in_explorer;

    #[test]
    fn rejects_empty_path() {
        let error = open_in_explorer("  ").expect_err("empty path should fail");
        assert!(error.contains("required"));
    }

    #[test]
    fn rejects_missing_path() {
        let error = open_in_explorer("/path/that/does/not/exist/for/coder-test")
            .expect_err("missing path should fail");
        assert!(error.contains("not found") || error.contains("Path not found"));
    }
}
