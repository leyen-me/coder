use std::path::{Path, PathBuf};

use serde::Serialize;

use super::search::{
    build_workspace_walker, is_hidden_path, relative_file_path, WorkspaceWalkOptions,
};
use super::text_file::is_gitignored;
use super::workspace_path::{format_error_path, resolve_workspace_path};

const DEFAULT_HEAD_LIMIT: u32 = 50;
const MAX_HEAD_LIMIT: u32 = 200;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePathMatch {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchWorkspacePathsResult {
    pub query: String,
    pub matches: Vec<WorkspacePathMatch>,
    pub total_matches: u32,
    pub truncated: bool,
}

#[tauri::command]
pub fn tool_search_workspace_paths(
    workspace_dir: String,
    query: Option<String>,
    head_limit: Option<u32>,
    respect_gitignore: Option<bool>,
) -> Result<SearchWorkspacePathsResult, String> {
    let workspace = PathBuf::from(workspace_dir.trim());
    if workspace.as_os_str().is_empty() {
        return Err("workspaceDir is required".to_string());
    }

    let query = query.unwrap_or_default().trim().to_string();
    let head_limit = head_limit
        .unwrap_or(DEFAULT_HEAD_LIMIT)
        .clamp(1, MAX_HEAD_LIMIT);
    let respect_gitignore = respect_gitignore.unwrap_or(true);

    let canonical_workspace = workspace
        .canonicalize()
        .map_err(|error| format!("Invalid workspaceDir: {error}"))?;
    let search_root = resolve_workspace_path(&workspace, ".")?;
    if !search_root.is_dir() {
        return Err(format!(
            "Path is not a directory: {}",
            format_error_path(&canonical_workspace, &search_root, ".")
        ));
    }

    let candidates = collect_workspace_paths(
        &workspace,
        WorkspaceWalkOptions {
            search_root: &search_root,
            respect_gitignore,
        },
        true,
    )?;

    let mut scored: Vec<(i32, WorkspacePathMatch)> = candidates
        .into_iter()
        .filter_map(|(path, is_dir)| {
            let name = basename_path(&path);
            if name.is_empty() {
                return None;
            }
            let score = match_score(&path, &name, &query)?;
            Some((
                score,
                WorkspacePathMatch {
                    name,
                    path,
                    is_dir,
                },
            ))
        })
        .collect();

    scored.sort_by(|left, right| {
        right
            .0
            .cmp(&left.0)
            .then_with(|| right.1.is_dir.cmp(&left.1.is_dir))
            .then_with(|| left.1.name.to_lowercase().cmp(&right.1.name.to_lowercase()))
    });

    let total_matches = scored.len() as u32;
    let truncated = total_matches > head_limit;
    scored.truncate(head_limit as usize);

    Ok(SearchWorkspacePathsResult {
        query,
        matches: scored.into_iter().map(|(_, item)| item).collect(),
        total_matches,
        truncated,
    })
}

fn collect_workspace_paths(
    workspace: &Path,
    options: WorkspaceWalkOptions<'_>,
    skip_hidden: bool,
) -> Result<Vec<(String, bool)>, String> {
    let canonical_workspace = workspace
        .canonicalize()
        .map_err(|error| format!("Invalid workspaceDir: {error}"))?;
    let walker = build_workspace_walker(&options)?;
    let mut paths = Vec::new();

    for entry in walker {
        let entry = entry.map_err(|error| format!("Failed to walk workspace: {error}"))?;
        let file_type = entry.file_type();
        if file_type.map(|kind| kind.is_symlink()).unwrap_or(false) {
            continue;
        }

        let is_dir = file_type.map(|kind| kind.is_dir()).unwrap_or(false);
        let absolute = entry.into_path();

        if skip_hidden && is_hidden_path(&absolute) {
            continue;
        }

        let Some(relative) = relative_file_path(&canonical_workspace, &absolute) else {
            continue;
        };

        if relative.is_empty() || relative == "." {
            continue;
        }

        if options.respect_gitignore
            && is_gitignored(&canonical_workspace, &absolute).unwrap_or(false)
        {
            continue;
        }

        paths.push((relative, is_dir));
    }

    Ok(paths)
}

fn basename_path(path: &str) -> String {
    path.rsplit('/').next().unwrap_or(path).to_string()
}

fn match_score(path: &str, name: &str, query: &str) -> Option<i32> {
    if query.is_empty() {
        return Some(0);
    }

    let query_lower = query.to_lowercase();
    let name_lower = name.to_lowercase();
    let path_lower = path.to_lowercase();

    if name_lower == query_lower {
        return Some(1_000);
    }
    if name_lower.starts_with(&query_lower) {
        return Some(900 - name.len() as i32);
    }
    if name_lower.contains(&query_lower) {
        return Some(700 - name.len() as i32);
    }

    for segment in path_lower.split('/') {
        if segment.starts_with(&query_lower) {
            return Some(600 - path.len() as i32);
        }
    }

    if path_lower.contains(&query_lower) {
        return Some(500 - path.len() as i32);
    }

    None
}

#[cfg(test)]
mod tests {
    use super::{match_score, tool_search_workspace_paths};
    use std::fs;
    use std::path::PathBuf;

    fn temp_workspace(name: &str) -> PathBuf {
        let temp = std::env::temp_dir().join(format!(
            "coder-search-workspace-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&temp).expect("create temp dir");
        temp
    }

    #[test]
    fn scores_name_prefix_higher_than_path_substring() {
        let exact = match_score("src/app.tsx", "app.tsx", "app").expect("score");
        let nested = match_score("src/components/app-shell.tsx", "app-shell.tsx", "app").expect("score");
        assert!(exact > nested);
    }

    #[test]
    fn finds_files_and_directories_by_query() {
        let temp = temp_workspace("match");
        fs::create_dir_all(temp.join("src/components")).expect("create dirs");
        fs::write(temp.join("src/main.ts"), "x").expect("write main");
        fs::write(temp.join("src/components/button.tsx"), "x").expect("write tsx");
        fs::write(temp.join("README.md"), "x").expect("write md");

        let result = tool_search_workspace_paths(
            temp.to_string_lossy().into_owned(),
            Some("button".to_string()),
            None,
            None,
        )
        .expect("search");

        assert_eq!(result.total_matches, 1);
        assert_eq!(result.matches[0].path, "src/components/button.tsx");
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn excludes_workspace_root_from_results() {
        let temp = temp_workspace("root");
        fs::write(temp.join("README.md"), "x").expect("write readme");

        let result = tool_search_workspace_paths(
            temp.to_string_lossy().into_owned(),
            Some(String::new()),
            None,
            None,
        )
        .expect("search");

        assert!(result.matches.iter().all(|item| !item.path.is_empty()));
        assert!(result.matches.iter().all(|item| !item.name.is_empty()));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn returns_limited_results_when_query_empty() {
        let temp = temp_workspace("empty");
        fs::create_dir_all(temp.join("src")).expect("create dir");
        fs::write(temp.join("src/a.ts"), "x").expect("write a");
        fs::write(temp.join("src/b.ts"), "x").expect("write b");

        let result = tool_search_workspace_paths(
            temp.to_string_lossy().into_owned(),
            Some(String::new()),
            Some(1),
            None,
        )
        .expect("search");

        assert_eq!(result.matches.len(), 1);
        assert!(result.total_matches >= 3);
        assert!(result.truncated);
        let _ = fs::remove_dir_all(temp);
    }
}
