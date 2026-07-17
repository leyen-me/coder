use std::path::{Path, PathBuf};

use serde::Serialize;

use super::workspace_path::format_absolute_path;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowseDirectoryEntry {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowseDirectoriesResult {
    pub path: String,
    pub parent: Option<String>,
    pub entries: Vec<BrowseDirectoryEntry>,
}

pub fn tool_browse_directories(path: Option<String>) -> Result<BrowseDirectoriesResult, String> {
    match path {
        Some(value) if !value.trim().is_empty() => browse_directory(value.trim()),
        _ => browse_roots(),
    }
}

fn user_home_dir() -> Option<PathBuf> {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok()
        .map(PathBuf::from)
}

fn browse_roots() -> Result<BrowseDirectoriesResult, String> {
    let mut entries = Vec::new();

    #[cfg(windows)]
    {
        for letter in b'A'..=b'Z' {
            let drive = format!("{}:\\", letter as char);
            let drive_path = PathBuf::from(&drive);
            if drive_path.exists() {
                entries.push(BrowseDirectoryEntry {
                    name: drive.clone(),
                    path: format_absolute_path(&drive_path),
                });
            }
        }
    }

    #[cfg(not(windows))]
    {
        entries.push(BrowseDirectoryEntry {
            name: "/".to_string(),
            path: "/".to_string(),
        });
    }

    if let Some(home) = user_home_dir() {
        if let Ok(canonical_home) = home.canonicalize() {
            if canonical_home.is_dir() {
                let label = canonical_home
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("Home")
                    .to_string();
                entries.push(BrowseDirectoryEntry {
                    name: format!("Home ({label})"),
                    path: format_absolute_path(&canonical_home),
                });
            }
        }
    }

    entries.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));

    Ok(BrowseDirectoriesResult {
        path: String::new(),
        parent: None,
        entries,
    })
}

fn browse_directory(raw_path: &str) -> Result<BrowseDirectoriesResult, String> {
    let path = PathBuf::from(raw_path);
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("Invalid path: {error}"))?;

    if !canonical.is_dir() {
        return Err("Path must be a directory".to_string());
    }

    Ok(BrowseDirectoriesResult {
        path: format_absolute_path(&canonical),
        parent: directory_parent(&canonical),
        entries: list_child_directories(&canonical)?,
    })
}

fn directory_parent(path: &Path) -> Option<String> {
    #[cfg(windows)]
    {
        let formatted = format_absolute_path(path);
        if is_windows_drive_root(&formatted) {
            return None;
        }
    }

    path.parent()
        .and_then(|parent| parent.canonicalize().ok())
        .map(|parent| format_absolute_path(&parent))
}

#[cfg(windows)]
fn is_windows_drive_root(path: &str) -> bool {
    let normalized = path.replace('\\', "/");
    normalized.len() == 2 && normalized.ends_with(':')
        || (normalized.len() == 3
            && normalized.as_bytes().get(1) == Some(&b':')
            && normalized.ends_with('/'))
}

fn list_child_directories(dir: &Path) -> Result<Vec<BrowseDirectoryEntry>, String> {
    let read_dir = std::fs::read_dir(dir)
        .map_err(|error| format!("Failed to read directory: {error}"))?;
    let mut entries = Vec::new();

    for entry in read_dir {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };

        let name = match entry.file_name().into_string() {
            Ok(name) if !name.starts_with('.') => name,
            _ => continue,
        };

        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };

        if !file_type.is_dir() {
            continue;
        }

        let path = match entry.path().canonicalize() {
            Ok(path) => path,
            Err(_) => continue,
        };

        entries.push(BrowseDirectoryEntry {
            name,
            path: format_absolute_path(&path),
        });
    }

    entries.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let temp = std::env::temp_dir().join(format!("coder-browse-{name}-{nanos}"));
        fs::create_dir_all(&temp).expect("create temp dir");
        temp
    }

    #[test]
    fn lists_child_directories() {
        let root = temp_dir("children");
        let child = root.join("project");
        fs::create_dir_all(&child).expect("create child");

        let result = browse_directory(root.to_string_lossy().as_ref()).expect("browse");
        assert_eq!(result.entries.len(), 1);
        assert_eq!(result.entries[0].name, "project");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn browse_roots_includes_home_when_available() {
        let result = browse_roots().expect("roots");
        assert!(result.entries.iter().any(|entry| entry.name.starts_with("Home (")));
    }
}
