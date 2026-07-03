use std::path::Path;

use ignore::WalkBuilder;

use super::text_file::is_gitignored;
use super::workspace_path::workspace_relative_path;

pub struct WorkspaceWalkOptions<'a> {
    pub search_root: &'a Path,
    pub respect_gitignore: bool,
}

/// Builds a workspace file walker rooted at `search_root`.
///
/// Respects `.gitignore` / `.git/info/exclude` when `respect_gitignore` is true.
pub fn build_workspace_walker(options: &WorkspaceWalkOptions<'_>) -> Result<ignore::Walk, String> {
    let mut builder = WalkBuilder::new(options.search_root);
    builder
        .git_ignore(options.respect_gitignore)
        .git_global(options.respect_gitignore)
        .git_exclude(options.respect_gitignore)
        .hidden(false)
        .follow_links(false);

    Ok(builder.build())
}

/// Returns true when any path component (other than `.` / `..`) starts with `.`.
pub fn is_hidden_path(path: &Path) -> bool {
    path.components().any(|component| {
        component
            .as_os_str()
            .to_str()
            .is_some_and(|part| part.starts_with('.') && part != "." && part != "..")
    })
}

/// Returns the workspace-relative path for a file, or None when outside workspace.
pub fn relative_file_path(workspace: &Path, file: &Path) -> Option<String> {
    let canonical_workspace = workspace.canonicalize().ok()?;
    let canonical_file = file.canonicalize().ok()?;
    if !canonical_file.starts_with(&canonical_workspace) {
        return None;
    }
    Some(workspace_relative_path(workspace, &canonical_file))
}

/// Collects regular files under `search_root` via the workspace walker.
pub fn collect_walk_files(
    workspace: &Path,
    options: WorkspaceWalkOptions<'_>,
    skip_hidden: bool,
) -> Result<Vec<String>, String> {
    let canonical_workspace = workspace
        .canonicalize()
        .map_err(|error| format!("Invalid workspaceDir: {error}"))?;
    let walker = build_workspace_walker(&options)?;
    let mut paths = Vec::new();

    for entry in walker {
        let entry = entry.map_err(|error| format!("Failed to walk workspace: {error}"))?;
        let file_type = entry.file_type();
        if file_type.map(|kind| kind.is_dir()).unwrap_or(true)
            || file_type.map(|kind| kind.is_symlink()).unwrap_or(false)
        {
            continue;
        }

        let absolute = entry.into_path();
        if skip_hidden && is_hidden_path(&absolute) {
            continue;
        }

        let Some(relative) = relative_file_path(&canonical_workspace, &absolute) else {
            continue;
        };

        if options.respect_gitignore
            && is_gitignored(&canonical_workspace, &absolute).unwrap_or(false)
        {
            continue;
        }

        paths.push(relative);
    }

    paths.sort_by(|left, right| left.to_lowercase().cmp(&right.to_lowercase()));
    Ok(paths)
}

#[cfg(test)]
mod tests {
    use super::{is_hidden_path, relative_file_path};
    use std::fs;
    use std::path::PathBuf;

    fn temp_workspace(name: &str) -> PathBuf {
        let temp = std::env::temp_dir().join(format!(
            "coder-search-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&temp).expect("create temp dir");
        temp
    }

    #[test]
    fn detects_hidden_paths() {
        assert!(is_hidden_path(PathBuf::from(".env").as_path()));
        assert!(is_hidden_path(
            PathBuf::from("src/.hidden/file.ts").as_path()
        ));
        assert!(!is_hidden_path(PathBuf::from("src/main.ts").as_path()));
    }

    #[test]
    fn returns_workspace_relative_path() {
        let temp = temp_workspace("relative");
        let file = temp.join("src/main.ts");
        fs::create_dir_all(file.parent().expect("parent")).expect("create dir");
        fs::write(&file, "x").expect("write file");

        let relative = relative_file_path(&temp, &file).expect("relative path");
        assert_eq!(relative, "src/main.ts");
        let _ = fs::remove_dir_all(temp);
    }
}
