use std::path::PathBuf;

use globset::{GlobBuilder, GlobSetBuilder};
use serde::Serialize;

use super::search::{collect_walk_files, to_search_root_relative, WorkspaceWalkOptions};
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
    show_hidden: Option<bool>,
    offset: Option<u32>,
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
    let show_hidden = show_hidden.unwrap_or(false);
    let offset = offset.unwrap_or(0);

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
        !show_hidden,
    )?;

    // BUG-1: match the pattern relative to the search root (target_directory),
    // so `a/**/file.txt` finds `target/a/b/file.txt` as the caller expects.
    let mut matches: Vec<String> = candidates
        .into_iter()
        .filter(|path| {
            let target_rel = to_search_root_relative(&workspace, &search_root, path);
            glob_set.is_match(&target_rel)
        })
        .collect();

    matches.sort_by(|left, right| left.to_lowercase().cmp(&right.to_lowercase()));
    let total_matches = matches.len() as u32;
    // BUG-8: page results with offset before applying head_limit.
    let offset = offset as usize;
    let truncated = matches.len().saturating_sub(offset) as u32 > head_limit;
    let paged: Vec<String> = matches.into_iter().skip(offset).take(head_limit as usize).collect();

    Ok(GlobResult {
        pattern: pattern.to_string(),
        target_directory: format_absolute_path(&search_root),
        matches: paged,
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
            None,
            None,
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
            None,
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
            Some("backend/src/tools".to_string()),
            Some(10),
            None,
            None,
            None,
        )
        .expect("glob project tools");

        assert!(!result.matches.is_empty());
        assert!(result.matches.iter().any(|path| path.ends_with("glob.rs")));
    }

    #[test]
    fn matches_pattern_relative_to_target_directory() {
        // BUG-1: a pattern anchored to a subdirectory of target_directory must
        // match, not require the full workspace-relative path.
        let temp = temp_workspace("bug1");
        fs::create_dir_all(temp.join("a/b/c")).expect("create dirs");
        fs::write(temp.join("a/b/c/file_c.txt"), "x").expect("write file");

        let result = tool_glob(
            temp.to_string_lossy().into_owned(),
            "a/**/file_c.txt".to_string(),
            Some(".".to_string()),
            None,
            None,
            None,
            None,
        )
        .expect("glob bug1");

        assert_eq!(result.total_matches, 1);
        assert!(result.matches.contains(&"a/b/c/file_c.txt".to_string()));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn offset_skips_leading_matches() {
        // BUG-8: offset pages past the first N matches.
        let temp = temp_workspace("offset");
        for index in 0..5 {
            fs::write(temp.join(format!("file-{index}.txt")), "x").expect("write file");
        }

        let result = tool_glob(
            temp.to_string_lossy().into_owned(),
            "*.txt".to_string(),
            None,
            Some(2),
            None,
            None,
            Some(2),
        )
        .expect("glob offset");

        assert_eq!(result.total_matches, 5);
        assert_eq!(result.matches.len(), 2);
        assert!(result.truncated);
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn show_hidden_includes_dotfiles() {
        // BUG-2: dotfiles are skipped by default but returned with show_hidden.
        let temp = temp_workspace("hidden");
        fs::write(temp.join(".hidden_file"), "x").expect("write hidden");
        fs::write(temp.join("visible.txt"), "x").expect("write visible");

        let hidden_off = tool_glob(
            temp.to_string_lossy().into_owned(),
            "*".to_string(),
            None,
            None,
            None,
            Some(false),
            None,
        )
        .expect("glob hidden off");
        assert!(!hidden_off.matches.iter().any(|m| m == ".hidden_file"));

        let hidden_on = tool_glob(
            temp.to_string_lossy().into_owned(),
            "*".to_string(),
            None,
            None,
            None,
            Some(true),
            None,
        )
        .expect("glob hidden on");
        assert!(hidden_on.matches.iter().any(|m| m == ".hidden_file"));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn symlink_name_remains_visible() {
        // BUG-7: globbing a symlink returns the link name, not the target's.
        let temp = temp_workspace("symlink");
        fs::write(temp.join("target.txt"), "x").expect("write target");
        #[cfg(unix)]
        std::os::unix::fs::symlink("target.txt", temp.join("link.txt")).expect("symlink");

        #[cfg(unix)]
        {
            let result = tool_glob(
                temp.to_string_lossy().into_owned(),
                "link.txt".to_string(),
                None,
                None,
                None,
                None,
                None,
            )
            .expect("glob symlink");
            assert!(result.matches.iter().any(|m| m == "link.txt"));
        }
        let _ = fs::remove_dir_all(temp);
    }
}
