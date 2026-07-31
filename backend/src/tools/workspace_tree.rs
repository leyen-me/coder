use std::path::{Path, PathBuf};

use ignore::gitignore::{Gitignore, GitignoreBuilder};
use serde::Serialize;

/// Max directory depth (inclusive of root).
const MAX_DEPTH: u32 = 6;

/// Directories always excluded at any level, even if not in `.gitignore`.
const ALWAYS_EXCLUDE: &[&str] = &[
    "node_modules",
    ".git",
    ".coder",
    ".logs",
    "target",
    "dist",
    "dist-ssr",
    "__pycache__",
    ".venv",
    "venv",
    ".next",
    ".nuxt",
    ".output",
    ".husky/_",
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTreeData {
    /// Formatted ASCII tree text for the requested slice.
    pub tree_text: String,
    /// Total number of lines in the full tree.
    pub total_lines: u32,
    /// 1-based start line of this slice.
    pub start_line: u32,
    /// 1-based end line (inclusive) of this slice.
    pub end_line: u32,
    /// Whether the output was truncated by max_lines.
    pub truncated: bool,
}

pub fn tool_get_workspace_tree(
    workspace_dir: String,
    start_line: Option<u32>,
    max_lines: Option<u32>,
) -> Result<WorkspaceTreeData, String> {
    let workspace = PathBuf::from(workspace_dir.trim());
    if workspace.as_os_str().is_empty() {
        return Err("workspaceDir is required".to_string());
    }

    let canonical_workspace = workspace
        .canonicalize()
        .map_err(|error| format!("Invalid workspaceDir: {error}"))?;

    if !canonical_workspace.is_dir() {
        return Err("workspaceDir is not a directory".to_string());
    }

    let gitignore = build_gitignore(&canonical_workspace)
        .map_err(|error| format!("Failed to load .gitignore: {error}"))?;

    let context = TreeContext {
        gitignore,
        canonical_workspace: &canonical_workspace,
    };

    let mut all_lines: Vec<String> = Vec::new();

    let display_name = canonical_workspace
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| ".".to_string());

    all_lines.push(display_name);

    collect_lines(
        &canonical_workspace,
        0,
        "",
        &mut all_lines,
        &context,
    );

    let total_lines = all_lines.len() as u32;
    let start = start_line.unwrap_or(1).max(1) as usize;
    let max = max_lines.unwrap_or(500) as usize;

    let end = if start.saturating_sub(1) + max >= total_lines as usize {
        total_lines as usize
    } else {
        start.saturating_sub(1) + max
    };
    let truncated = end < total_lines as usize;

    let slice: Vec<&str> = if start <= total_lines as usize {
        all_lines[(start - 1)..end].iter().map(String::as_str).collect()
    } else {
        Vec::new()
    };

    let tree_text = slice.join("\n");

    Ok(WorkspaceTreeData {
        tree_text,
        total_lines,
        start_line: start as u32,
        end_line: end as u32,
        truncated,
    })
}

struct TreeContext<'a> {
    gitignore: Gitignore,
    canonical_workspace: &'a Path,
}

/// Recursively collect tree lines.
///
/// `prefix` is the tree-drawing prefix for the current level (e.g. "│   │   ").
/// Entries are sorted: directories first, then alphabetically.
fn collect_lines(
    dir: &Path,
    depth: u32,
    prefix: &str,
    all_lines: &mut Vec<String>,
    context: &TreeContext,
) {
    if depth >= MAX_DEPTH {
        return;
    }

    let read_dir = match std::fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(_) => return,
    };

    let mut entries: Vec<(String, bool, PathBuf)> = Vec::new();

    for entry in read_dir {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let name = entry.file_name().to_string_lossy().into_owned();

        // Always-exclude directories (node_modules, .git, etc.)
        if ALWAYS_EXCLUDE.contains(&name.as_str()) {
            continue;
        }

        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };

        let entry_path = entry.path();
        let is_dir = file_type.is_dir();

        // Symlinks to directories are treated as files for safety
        let treat_as_dir = is_dir && !file_type.is_symlink();

        // Check .gitignore
        let relative = entry_path
            .strip_prefix(context.canonical_workspace)
            .unwrap_or(&entry_path);
        let is_ignored = context
            .gitignore
            .matched(relative, is_dir)
            .is_ignore();

        if is_ignored {
            continue;
        }

        entries.push((name, treat_as_dir, entry_path));
    }

    // Sort: directories first, then alphabetically
    entries.sort_by(|a, b| {
        b.1.cmp(&a.1)
            .then_with(|| a.0.to_lowercase().cmp(&b.0.to_lowercase()))
    });

    for (idx, (name, is_dir, entry_path)) in entries.iter().enumerate() {
        let is_last = idx == entries.len() - 1;
        let connector = if is_last { "└── " } else { "├── " };
        let suffix = if *is_dir { "/" } else { "" };

        all_lines.push(format!("{}{}{}{}", prefix, connector, name, suffix));

        if *is_dir && depth + 1 < MAX_DEPTH {
            let child_prefix = if is_last {
                format!("{}    ", prefix)
            } else {
                format!("{}│   ", prefix)
            };
            collect_lines(entry_path, depth + 1, &child_prefix, all_lines, context);
        }
    }
}

fn build_gitignore(workspace: &Path) -> Result<Gitignore, ignore::Error> {
    let mut builder = GitignoreBuilder::new(workspace);
    let root_gitignore = workspace.join(".gitignore");
    if root_gitignore.is_file() {
        builder.add(root_gitignore);
    }

    let exclude = workspace.join(".git").join("info").join("exclude");
    if exclude.is_file() {
        builder.add(exclude);
    }

    builder.build()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn temp_workspace(name: &str) -> PathBuf {
        let temp = std::env::temp_dir().join(format!(
            "coder-workspace-tree-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&temp).expect("create temp dir");
        temp
    }

    #[test]
    fn produces_tree_for_empty_workspace() {
        let temp = temp_workspace("empty");
        let data = tool_get_workspace_tree(
            temp.to_string_lossy().into_owned(),
            None,
            None,
        )
        .expect("get workspace tree");
        assert_eq!(data.total_lines, 1); // just the root
        assert!(!data.truncated);
        assert_eq!(data.start_line, 1);
        assert_eq!(data.end_line, 1);
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn includes_files_and_directories() {
        let temp = temp_workspace("files");
        fs::write(temp.join("README.md"), "hello").expect("write file");
        fs::create_dir_all(temp.join("src/components")).expect("create dir");
        fs::write(temp.join("src/index.ts"), "// code").expect("write file");

        let data = tool_get_workspace_tree(
            temp.to_string_lossy().into_owned(),
            None,
            None,
        )
        .expect("get workspace tree");
        assert!(data.tree_text.contains("README.md"));
        assert!(data.tree_text.contains("src/"));
        assert!(data.tree_text.contains("index.ts"));
        assert!(data.total_lines >= 4); // root + README + src + index.ts
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn excludes_node_modules() {
        let temp = temp_workspace("nm");
        fs::create_dir_all(temp.join("node_modules/some-pkg")).expect("create nm");
        fs::write(temp.join("node_modules/some-pkg/index.js"), "x").expect("write nm file");
        fs::write(temp.join("package.json"), "{}").expect("write pkg");

        let data = tool_get_workspace_tree(
            temp.to_string_lossy().into_owned(),
            None,
            None,
        )
        .expect("get workspace tree");
        assert!(!data.tree_text.contains("node_modules"));
        assert!(data.tree_text.contains("package.json"));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn respects_gitignore() {
        let temp = temp_workspace("gi");
        fs::write(temp.join(".gitignore"), "secrets/\n").expect("write gitignore");
        fs::create_dir_all(temp.join("secrets")).expect("create secrets dir");
        fs::write(temp.join("secrets/password.txt"), "hunter2").expect("write secret");
        fs::write(temp.join("public.txt"), "ok").expect("write public");

        let data = tool_get_workspace_tree(
            temp.to_string_lossy().into_owned(),
            None,
            None,
        )
        .expect("get workspace tree");
        assert!(!data.tree_text.contains("secrets"));
        assert!(data.tree_text.contains("public.txt"));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn shows_dir_slash() {
        let temp = temp_workspace("slash");
        fs::create_dir_all(temp.join("docs")).expect("create dir");
        fs::write(temp.join("docs/readme.md"), "# docs").expect("write file");

        let data = tool_get_workspace_tree(
            temp.to_string_lossy().into_owned(),
            None,
            None,
        )
        .expect("get workspace tree");
        assert!(data.tree_text.contains("docs/"));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn paginates_with_start_line_and_max_lines() {
        let temp = temp_workspace("pager");
        fs::create_dir_all(temp.join("a")).expect("create a");
        fs::create_dir_all(temp.join("b")).expect("create b");
        fs::create_dir_all(temp.join("c")).expect("create c");

        // Full tree: root, a/, b/, c/ = 4 lines
        let full = tool_get_workspace_tree(
            temp.to_string_lossy().into_owned(),
            None,
            None,
        )
        .expect("full tree");
        assert_eq!(full.total_lines, 4);

        // Slice: lines 2-3
        let sliced = tool_get_workspace_tree(
            temp.to_string_lossy().into_owned(),
            Some(2),
            Some(2),
        )
        .expect("sliced tree");
        assert_eq!(sliced.start_line, 2);
        assert_eq!(sliced.end_line, 3);
        assert_eq!(sliced.total_lines, 4);
        assert!(sliced.truncated);
        assert!(sliced.tree_text.contains("a/"));
        assert!(sliced.tree_text.contains("b/"));
        assert!(!sliced.tree_text.contains("c/"));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn errors_on_nonexistent_workspace() {
        let result = tool_get_workspace_tree(
            "/tmp/nonexistent-coder-test-dir".to_string(),
            None,
            None,
        );
        assert!(result.is_err());
    }
}
