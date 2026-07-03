use std::path::PathBuf;

use globset::{GlobBuilder, GlobSetBuilder};
use serde::Serialize;

use super::search::{collect_walk_files, WorkspaceWalkOptions};
use super::workspace_path::{format_absolute_path, format_error_path, resolve_workspace_path};

const DEFAULT_HEAD_LIMIT: u32 = 100;
const MAX_HEAD_LIMIT: u32 = 1000;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobResult {
    pub pattern: String,
    pub target_directory: String,
    pub matches: Vec<String>,
    pub total_matches: u32,
    pub truncated: bool,
}

pub fn tool_glob(
    workspace_dir: String,
    glob_pattern: String,
    target_directory: Option<String>,
    head_limit: Option<u32>,
    respect_gitignore: Option<bool>,
) -> Result<GlobResult, String> {
    let workspace = PathBuf::from(workspace_dir.trim());
    if workspace.as_os_str().is_empty() {
        return Err("workspaceDir is required".to_string());
    }

    let pattern = glob_pattern.trim();
    if pattern.is_empty() {
        return Err("glob_pattern is required".to_string());
    }

    let target = target_directory
        .unwrap_or_else(|| ".".to_string())
        .trim()
        .to_string();
    let head_limit = head_limit
        .unwrap_or(DEFAULT_HEAD_LIMIT)
        .clamp(1, MAX_HEAD_LIMIT);
    let respect_gitignore = respect_gitignore.unwrap_or(true);

    let canonical_workspace = workspace
        .canonicalize()
        .map_err(|error| format!("Invalid workspaceDir: {error}"))?;
    let search_root = resolve_workspace_path(&workspace, &target)?;
    if !search_root.is_dir() {
        return Err(format!(
            "Path is not a directory: {}",
            format_error_path(&canonical_workspace, &search_root, &target)
        ));
    }

    let glob_set = GlobSetBuilder::new()
        .add(
            GlobBuilder::new(pattern)
                .literal_separator(true)
                .build()
                .map_err(|error| format!("Invalid glob_pattern: {error}"))?,
        )
        .build()
        .map_err(|error| format!("Invalid glob_pattern: {error}"))?;

    let candidates = collect_walk_files(
        &workspace,
        WorkspaceWalkOptions {
            search_root: &search_root,
            respect_gitignore,
        },
        true,
    )?;

    let mut matches: Vec<String> = candidates
        .into_iter()
        .filter(|path| glob_set.is_match(path))
        .collect();

    matches.sort_by(|left, right| left.to_lowercase().cmp(&right.to_lowercase()));
    let total_matches = matches.len() as u32;
    let truncated = total_matches > head_limit;
    matches.truncate(head_limit as usize);

    Ok(GlobResult {
        pattern: pattern.to_string(),
        target_directory: format_absolute_path(&search_root),
        matches,
        total_matches,
        truncated,
    })
}

#[cfg(test)]
mod tests {
    use super::tool_glob;
    use std::fs;
    use std::path::PathBuf;

    fn temp_workspace(name: &str) -> PathBuf {
        let temp = std::env::temp_dir().join(format!(
            "coder-glob-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&temp).expect("create temp dir");
        temp
    }

    #[test]
    fn matches_typescript_files_recursively() {
        let temp = temp_workspace("match");
        fs::create_dir_all(temp.join("src/components")).expect("create dirs");
        fs::write(temp.join("src/main.ts"), "x").expect("write main");
        fs::write(temp.join("src/components/button.tsx"), "x").expect("write tsx");
        fs::write(temp.join("README.md"), "x").expect("write md");

        let result = tool_glob(
            temp.to_string_lossy().into_owned(),
            "**/*.{ts,tsx}".to_string(),
            Some(".".to_string()),
            None,
            None,
        )
        .expect("glob");

        assert_eq!(result.total_matches, 2);
        assert!(result.matches.contains(&"src/main.ts".to_string()));
        assert!(result
            .matches
            .contains(&"src/components/button.tsx".to_string()));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn excludes_gitignored_files() {
        let temp = temp_workspace("gitignore");
        fs::create_dir_all(temp.join("src")).expect("create dir");
        fs::write(temp.join("src/visible.ts"), "x").expect("write visible");
        fs::write(temp.join("src/ignored.ts"), "x").expect("write ignored");
        fs::write(temp.join(".gitignore"), "src/ignored.ts\n").expect("write gitignore");

        let result = tool_glob(
            temp.to_string_lossy().into_owned(),
            "**/*.ts".to_string(),
            None,
            None,
            Some(true),
        )
        .expect("glob");

        assert_eq!(result.total_matches, 1);
        assert_eq!(result.matches, vec!["src/visible.ts".to_string()]);
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn truncates_to_head_limit() {
        let temp = temp_workspace("limit");
        for index in 0..5 {
            fs::write(temp.join(format!("file-{index}.txt")), "x").expect("write file");
        }

        let result = tool_glob(
            temp.to_string_lossy().into_owned(),
            "*.txt".to_string(),
            None,
            Some(2),
            None,
        )
        .expect("glob");

        assert_eq!(result.matches.len(), 2);
        assert_eq!(result.total_matches, 5);
        assert!(result.truncated);
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_invalid_glob_pattern() {
        let temp = temp_workspace("invalid");
        let error = tool_glob(
            temp.to_string_lossy().into_owned(),
            "[invalid".to_string(),
            None,
            None,
            None,
        )
        .expect_err("invalid glob");
        assert!(error.contains("Invalid glob_pattern"));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn finds_rust_files_in_project_workspace() {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let workspace = manifest.parent().expect("workspace root");

        let result = tool_glob(
            workspace.to_string_lossy().into_owned(),
            "**/*.rs".to_string(),
            Some("src-tauri/src/tools".to_string()),
            Some(10),
            None,
        )
        .expect("glob project tools");

        assert!(!result.matches.is_empty());
        assert!(result.matches.iter().any(|path| path.ends_with("glob.rs")));
    }
}
