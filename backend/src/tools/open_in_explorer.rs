use std::path::{Path, PathBuf};

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

    open::that(&open_path).map_err(|error| format!("Failed to open file manager: {error}"))
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
}
