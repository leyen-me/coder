use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(target_os = "windows")]
use super::workspace_path::strip_windows_verbatim_prefix;

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
    let open_path = path_for_file_manager(&canonical);

    spawn_file_manager(&open_path).map_err(|error| format!("Failed to open file manager: {error}"))
}

/// Returns a native path suitable for spawning the platform file manager.
///
/// On Windows, `canonicalize()` yields a `\\?\` verbatim prefix that many
/// shell helpers mishandle, and `explorer.exe` also mis-parses forward slashes.
fn path_for_file_manager(path: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        PathBuf::from(strip_windows_verbatim_prefix(&path.to_string_lossy()))
    }

    #[cfg(not(target_os = "windows"))]
    {
        path.to_path_buf()
    }
}

fn spawn_file_manager(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Do not use `open::that` / `start` here. On Windows, `start <dir>` can
        // launch an unrelated executable when the folder basename matches an app
        // on PATH (for example `...\coder` vs `coder.exe`). Explorer accepts a
        // trailing `\.` suffix to unambiguously open the directory itself.
        let explorer_target = path.join(".");
        Command::new("explorer")
            .arg(explorer_target)
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
    use super::{open_in_explorer, path_for_file_manager};
    use std::path::Path;

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

    #[cfg(target_os = "windows")]
    #[test]
    fn path_for_file_manager_strips_verbatim_prefix_and_keeps_backslashes() {
        let path = Path::new(r"\\?\C:\Users\test\workspace");
        let formatted = path_for_file_manager(path);
        assert_eq!(formatted, Path::new(r"C:\Users\test\workspace"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_explorer_target_uses_trailing_dot_suffix() {
        let path = path_for_file_manager(Path::new(r"C:\Users\test\coder"));
        let explorer_target = path.join(".");
        assert_eq!(explorer_target, Path::new(r"C:\Users\test\coder\."));
    }
}
