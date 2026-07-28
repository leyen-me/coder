use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use globset::{GlobBuilder, GlobSet, GlobSetBuilder};
use regex::RegexBuilder;
use serde::Serialize;

use super::search::{
    build_workspace_walker, is_hidden_path, relative_file_path, to_search_root_relative,
    WorkspaceWalkOptions,
};
use super::text_file::{
    decode_text, detect_binary, is_gitignored, is_sensitive_path, read_binary_sample,
    MAX_READ_BYTES,
};
use super::workspace_path::{
    format_absolute_path, format_error_path, resolve_workspace_write_path, workspace_relative_path,
};

const DEFAULT_HEAD_LIMIT: u32 = 200;
const MAX_HEAD_LIMIT: u32 = 1000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GrepOutputMode {
    Content,
    FilesWithMatches,
    Count,
}

/// A single matching line from grep results.
/// If the line exceeds [`MAX_LINE_BYTES`], it is truncated to avoid
/// bloating the agent context with minified/one-line file contents.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrepContentMatch {
    pub path: String,
    pub line_number: u32,
    pub line: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_before: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_after: Option<Vec<String>>,
    /// Whether `line` was truncated after [`MAX_LINE_BYTES`].
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub line_truncated: bool,
}

/// Maximum bytes for a single grep match line.
/// Lines longer than this are truncated to prevent a minified/one-line
/// file (e.g. bundled JS, WASM glue code) from filling the agent context.
const MAX_LINE_BYTES: usize = 10 * 1024;

/// Truncate `s` in-place to [`MAX_LINE_BYTES`], returning whether it was truncated.
fn truncate_line(s: &mut String) -> bool {
    if s.len() > MAX_LINE_BYTES {
        s.truncate(MAX_LINE_BYTES);
        true
    } else {
        false
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrepCountMatch {
    pub path: String,
    pub count: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrepResult {
    pub pattern: String,
    pub path: String,
    pub output_mode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub matches: Option<Vec<GrepContentMatch>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub files: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub counts: Option<Vec<GrepCountMatch>>,
    pub total_matches: u32,
    pub truncated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skipped_files: Option<u32>,
}

pub fn tool_grep(
    workspace_dir: String,
    pattern: String,
    path: Option<String>,
    glob: Option<String>,
    output_mode: Option<String>,
    case_insensitive: Option<bool>,
    context_before: Option<u32>,
    context_after: Option<u32>,
    context: Option<u32>,
    head_limit: Option<u32>,
    offset: Option<u32>,
    multiline: Option<bool>,
    respect_gitignore: Option<bool>,
    show_hidden: Option<bool>,
) -> Result<GrepResult, String> {
    let workspace = PathBuf::from(workspace_dir.trim());
    if workspace.as_os_str().is_empty() {
        return Err("workspaceDir is required".to_string());
    }

    let raw_pattern = pattern.trim();
    if raw_pattern.is_empty() {
        return Err("pattern is required".to_string());
    }

    let search_path = path.unwrap_or_else(|| ".".to_string());
    let mode = parse_output_mode(output_mode.as_deref())?;
    let head_limit = head_limit
        .unwrap_or(DEFAULT_HEAD_LIMIT)
        .clamp(1, MAX_HEAD_LIMIT);
    let offset = offset.unwrap_or(0);
    let respect_gitignore = respect_gitignore.unwrap_or(true);
    let case_insensitive = case_insensitive.unwrap_or(false);
    let multiline = multiline.unwrap_or(false);
    let show_hidden = show_hidden.unwrap_or(false);

    let (before, after) = resolve_context(context_before, context_after, context);

    let regex_pattern = if multiline {
        format!("(?s){raw_pattern}")
    } else {
        raw_pattern.to_string()
    };

    let regex = RegexBuilder::new(&regex_pattern)
        .case_insensitive(case_insensitive)
        .build()
        .map_err(|error| format!("Invalid pattern: {error}"))?;

    let canonical_workspace = workspace
        .canonicalize()
        .map_err(|error| format!("Invalid workspaceDir: {error}"))?;
    let search_path_trimmed = search_path.trim();
    let target = if search_path_trimmed == "." {
        canonical_workspace.clone()
    } else {
        resolve_workspace_write_path(&workspace, search_path_trimmed)?
    };

    if !target.exists() {
        return Err(format!(
            "Path not found: {}",
            format_error_path(&canonical_workspace, &target, search_path_trimmed)
        ));
    }
    let target_display = format_absolute_path(&target);

    if respect_gitignore && is_gitignored(&workspace, &target).unwrap_or(false) {
        return Err("Path is ignored by .gitignore".to_string());
    }

    let glob_filter = glob
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    let mut files = if target.is_file() {
        vec![target]
    } else {
        collect_grep_files(
            &canonical_workspace,
            &target,
            respect_gitignore,
            glob_filter.as_deref(),
            show_hidden,
        )?
    };

    files.sort_by(|left, right| {
        workspace_relative_path(&workspace, left)
            .to_lowercase()
            .cmp(&workspace_relative_path(&workspace, right).to_lowercase())
    });

    let mut skipped_files = 0_u32;
    let mut total_matches = 0_u32;
    let mut truncated = false;
    let mut content_matches = Vec::new();
    let mut file_matches = Vec::new();
    let mut count_matches = Vec::new();
    let mut skipped_for_offset = 0_u32;

    'files: for file in files {
        let relative = workspace_relative_path(&workspace, &file);
        if is_sensitive_path(&relative) {
            skipped_files += 1;
            continue;
        }

        let metadata = match fs::metadata(&file) {
            Ok(value) => value,
            Err(_) => {
                skipped_files += 1;
                continue;
            }
        };
        if metadata.len() > MAX_READ_BYTES {
            skipped_files += 1;
            continue;
        }

        let sample = match read_binary_sample(&file) {
            Ok(value) => value,
            Err(_) => {
                skipped_files += 1;
                continue;
            }
        };
        // BUG-5: only skip files whose sample is a recognized binary container
        // (image/pdf/zip/...). A stray NUL byte in an otherwise-text file is no
        // longer grounds to skip the whole file; such lines are filtered below.
        if let Some(mime) = detect_binary(&sample) {
            if mime != "application/octet-stream" {
                skipped_files += 1;
                continue;
            }
        }

        let bytes = match fs::read(&file) {
            Ok(value) => value,
            Err(_) => {
                skipped_files += 1;
                continue;
            }
        };
        let Some((text, _encoding)) = decode_text(&bytes) else {
            skipped_files += 1;
            continue;
        };

        let lines: Vec<&str> = text.split_inclusive('\n').collect();
        let normalized_lines: Vec<String> = lines
            .iter()
            .map(|line| line.strip_suffix('\n').unwrap_or(line).to_string())
            .filter(|line| !line.contains('\0'))
            .collect();

        // BUG-6: an empty file yields one zero-width match for patterns that
        // can match the empty string (e.g. `.*`), instead of zero matches.
        if normalized_lines.is_empty() {
            if regex.is_match("") {
                match mode {
                    GrepOutputMode::Content => {
                        total_matches += 1;
                        if skipped_for_offset < offset {
                            skipped_for_offset += 1;
                        } else if (content_matches.len() as u32) < head_limit {
                            content_matches.push(GrepContentMatch {
                                path: relative.clone(),
                                line_number: 1,
                                line: String::new(),
                                context_before: None,
                                context_after: None,
                                line_truncated: false,
                            });
                        } else {
                            truncated = true;
                        }
                    }
                    GrepOutputMode::FilesWithMatches => {
                        total_matches += 1;
                        if skipped_for_offset < offset {
                            skipped_for_offset += 1;
                        } else if (file_matches.len() as u32) < head_limit {
                            file_matches.push(relative);
                        } else {
                            truncated = true;
                        }
                    }
                    GrepOutputMode::Count => {
                        total_matches += 1;
                        if skipped_for_offset >= offset {
                            if (count_matches.len() as u32) < head_limit {
                                count_matches.push(GrepCountMatch {
                                    path: relative,
                                    count: 1,
                                });
                            } else {
                                truncated = true;
                            }
                        } else {
                            skipped_for_offset += 1;
                        }
                    }
                }
            }
            continue;
        }

        match mode {
            GrepOutputMode::Content => {
                if multiline {
                    for mat in regex.find_iter(&text) {
                        total_matches += 1;
                        if skipped_for_offset < offset {
                            skipped_for_offset += 1;
                            continue;
                        }
                        if content_matches.len() as u32 >= head_limit {
                            truncated = true;
                            break 'files;
                        }

                        let line_number = text[..mat.start()]
                            .bytes()
                            .filter(|byte| *byte == b'\n')
                            .count() as u32
                            + 1;
                        let (before_lines, after_lines) = context_lines(
                            &normalized_lines,
                            line_number.saturating_sub(1) as usize,
                            before,
                            after,
                        );

                        let mut matched_line = normalized_lines
                            .get(line_number.saturating_sub(1) as usize)
                            .cloned()
                            .unwrap_or_default();
                        let line_truncated = truncate_line(&mut matched_line);
                        content_matches.push(GrepContentMatch {
                            path: relative.clone(),
                            line_number,
                            line: matched_line,
                            context_before: before_lines,
                            context_after: after_lines,
                            line_truncated,
                        });
                    }
                    continue;
                }

                for (index, line) in normalized_lines.iter().enumerate() {
                    if !regex.is_match(line) {
                        continue;
                    }

                    total_matches += 1;
                    if skipped_for_offset < offset {
                        skipped_for_offset += 1;
                        continue;
                    }
                    if content_matches.len() as u32 >= head_limit {
                        truncated = true;
                        break 'files;
                    }

                    let (before_lines, after_lines) =
                        context_lines(&normalized_lines, index, before, after);
                    let mut matched_line = line.clone();
                    let line_truncated = truncate_line(&mut matched_line);
                    content_matches.push(GrepContentMatch {
                        path: relative.clone(),
                        line_number: index as u32 + 1,
                        line: matched_line,
                        context_before: before_lines,
                        context_after: after_lines,
                        line_truncated,
                    });
                }
            }
            GrepOutputMode::FilesWithMatches => {
                let matched = if multiline {
                    regex.is_match(&text)
                } else {
                    normalized_lines.iter().any(|line| regex.is_match(line))
                };
                if !matched {
                    continue;
                }

                total_matches += 1;
                if skipped_for_offset < offset {
                    skipped_for_offset += 1;
                    continue;
                }
                if file_matches.len() as u32 >= head_limit {
                    truncated = true;
                    break 'files;
                }
                file_matches.push(relative);
            }
            GrepOutputMode::Count => {
                let count = if multiline {
                    regex.find_iter(&text).count() as u32
                } else {
                    normalized_lines
                        .iter()
                        .filter(|line| regex.is_match(line))
                        .count() as u32
                };
                if count == 0 {
                    continue;
                }

                total_matches += count;

                if skipped_for_offset >= offset {
                    if count_matches.len() as u32 >= head_limit {
                        truncated = true;
                        break 'files;
                    }
                    count_matches.push(GrepCountMatch {
                        path: relative,
                        count,
                    });
                    continue;
                }

                if skipped_for_offset + count <= offset {
                    skipped_for_offset += count;
                    continue;
                }

                let included_count = count - (offset - skipped_for_offset);
                skipped_for_offset = offset;
                if included_count == 0 {
                    continue;
                }
                if count_matches.len() as u32 >= head_limit {
                    truncated = true;
                    break 'files;
                }
                count_matches.push(GrepCountMatch {
                    path: relative,
                    count: included_count,
                });
            }
        }
    }

    Ok(build_grep_result(
        raw_pattern,
        &target_display,
        mode,
        total_matches,
        truncated,
        skipped_files,
        content_matches,
        file_matches,
        count_matches,
    ))
}

fn parse_output_mode(raw: Option<&str>) -> Result<GrepOutputMode, String> {
    match raw
        .unwrap_or("content")
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "content" => Ok(GrepOutputMode::Content),
        "files_with_matches" => Ok(GrepOutputMode::FilesWithMatches),
        "count" => Ok(GrepOutputMode::Count),
        other => Err(format!("Invalid output_mode: {other}")),
    }
}

fn resolve_context(before: Option<u32>, after: Option<u32>, both: Option<u32>) -> (u32, u32) {
    if let Some(value) = both {
        return (value, value);
    }
    (before.unwrap_or(0), after.unwrap_or(0))
}

fn context_lines(
    lines: &[String],
    index: usize,
    before: u32,
    after: u32,
) -> (Option<Vec<String>>, Option<Vec<String>>) {
    let before_lines = if before == 0 {
        None
    } else {
        let start = index.saturating_sub(before as usize);
        Some(lines[start..index].to_vec())
    };
    let after_lines = if after == 0 {
        None
    } else {
        let end = (index + 1 + after as usize).min(lines.len());
        Some(lines[index + 1..end].to_vec())
    };
    (before_lines, after_lines)
}

fn collect_grep_files(
    workspace: &Path,
    search_root: &Path,
    respect_gitignore: bool,
    glob_filter: Option<&str>,
    show_hidden: bool,
) -> Result<Vec<PathBuf>, String> {
    let canonical_workspace = workspace
        .canonicalize()
        .map_err(|error| format!("Invalid workspaceDir: {error}"))?;
    let file_glob = glob_filter.map(build_glob_set).transpose()?;

    let walker = build_workspace_walker(&WorkspaceWalkOptions {
        search_root,
        respect_gitignore,
    })?;

    let mut files = Vec::new();
    // BUG-3: skip symlink entries already represented by their resolved target
    // so the same content is not reported twice.
    let mut seen: HashSet<std::path::PathBuf> = HashSet::new();
    for entry in walker {
        let entry = entry.map_err(|error| format!("Failed to walk workspace: {error}"))?;
        let file_type = entry.file_type();
        if file_type.map(|kind| kind.is_dir()).unwrap_or(true) {
            continue;
        }

        let absolute = entry.into_path();
        if !show_hidden && is_hidden_path(&absolute) {
            continue;
        }
        let resolved = absolute.canonicalize().unwrap_or_else(|_| absolute.clone());
        if !seen.insert(resolved) {
            continue;
        }
        let Some(relative) = relative_file_path(&canonical_workspace, &absolute) else {
            continue;
        };
        if respect_gitignore && is_gitignored(&canonical_workspace, &absolute).unwrap_or(false) {
            continue;
        }
        if let Some(glob_set) = &file_glob {
            // BUG-1: match the glob filter relative to the search root.
            let target_rel = to_search_root_relative(&canonical_workspace, search_root, &relative);
            if !glob_set.is_match(&target_rel) {
                continue;
            }
        }
        files.push(absolute);
    }

    Ok(files)
}

fn build_glob_set(pattern: &str) -> Result<GlobSet, String> {
    GlobSetBuilder::new()
        .add(
            GlobBuilder::new(pattern)
                .literal_separator(true)
                .build()
                .map_err(|error| format!("Invalid glob filter: {error}"))?,
        )
        .build()
        .map_err(|error| format!("Invalid glob filter: {error}"))
}

fn build_grep_result(
    pattern: &str,
    target: &str,
    mode: GrepOutputMode,
    total_matches: u32,
    truncated: bool,
    skipped_files: u32,
    content_matches: Vec<GrepContentMatch>,
    file_matches: Vec<String>,
    count_matches: Vec<GrepCountMatch>,
) -> GrepResult {
    let output_mode = match mode {
        GrepOutputMode::Content => "content",
        GrepOutputMode::FilesWithMatches => "files_with_matches",
        GrepOutputMode::Count => "count",
    }
    .to_string();

    GrepResult {
        pattern: pattern.to_string(),
        path: target.to_string(),
        output_mode: output_mode.clone(),
        matches: if mode == GrepOutputMode::Content {
            Some(content_matches)
        } else {
            None
        },
        files: if mode == GrepOutputMode::FilesWithMatches {
            Some(file_matches)
        } else {
            None
        },
        counts: if mode == GrepOutputMode::Count {
            Some(count_matches)
        } else {
            None
        },
        total_matches,
        truncated,
        skipped_files: if skipped_files > 0 {
            Some(skipped_files)
        } else {
            None
        },
    }
}

#[cfg(test)]
mod tests {
    use super::tool_grep;
    use std::fs;
    use std::path::PathBuf;

    fn temp_workspace(name: &str) -> PathBuf {
        let temp = std::env::temp_dir().join(format!(
            "coder-grep-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&temp).expect("create temp dir");
        temp
    }

    #[test]
    fn finds_content_matches_with_context() {
        let temp = temp_workspace("content");
        fs::create_dir_all(temp.join("src")).expect("create dir");
        fs::write(temp.join("src/main.ts"), "alpha\nbeta needle\ngamma\n").expect("write file");

        let result = tool_grep(
            temp.to_string_lossy().into_owned(),
            "needle".to_string(),
            Some("src".to_string()),
            None,
            Some("content".to_string()),
            None,
            None,
            Some(1),
            Some(1),
            None,
            None,
            None,
            None,
            None,
        )
        .expect("grep");

        let matches = result.matches.expect("matches");
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].line_number, 2);
        assert_eq!(
            matches[0].context_before.as_ref().expect("before"),
            &["alpha"]
        );
        assert_eq!(
            matches[0].context_after.as_ref().expect("after"),
            &["gamma"]
        );
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn returns_files_with_matches() {
        let temp = temp_workspace("files");
        fs::write(temp.join("a.ts"), "hello").expect("write a");
        fs::write(temp.join("b.ts"), "world").expect("write b");

        let result = tool_grep(
            temp.to_string_lossy().into_owned(),
            "hello".to_string(),
            None,
            Some("*.ts".to_string()),
            Some("files_with_matches".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .expect("grep");

        assert_eq!(result.files.expect("files"), vec!["a.ts".to_string()]);
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn returns_count_mode() {
        let temp = temp_workspace("count");
        fs::write(temp.join("a.ts"), "foo\nfoo\nbar\n").expect("write file");

        let result = tool_grep(
            temp.to_string_lossy().into_owned(),
            "foo".to_string(),
            None,
            None,
            Some("count".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .expect("grep");

        let counts = result.counts.expect("counts");
        assert_eq!(counts.len(), 1);
        assert_eq!(counts[0].count, 2);
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn count_mode_respects_offset_within_partial_file() {
        let temp = temp_workspace("count-offset");
        fs::write(temp.join("a.txt"), "foo\n".repeat(30)).expect("write a");
        fs::write(temp.join("b.txt"), "foo\n".repeat(30)).expect("write b");
        fs::write(temp.join("c.txt"), "foo\n".repeat(10)).expect("write c");

        let result = tool_grep(
            temp.to_string_lossy().into_owned(),
            "foo".to_string(),
            None,
            None,
            Some("count".to_string()),
            None,
            None,
            None,
            None,
            None,
            Some(50),
            None,
            None,
            None,
        )
        .expect("grep");

        let counts = result.counts.expect("counts");
        assert_eq!(counts.len(), 2);
        assert_eq!(counts[0].path, "b.txt");
        assert_eq!(counts[0].count, 10);
        assert_eq!(counts[1].path, "c.txt");
        assert_eq!(counts[1].count, 10);
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn count_mode_multiline_counts_all_occurrences() {
        let temp = temp_workspace("multiline-count");
        fs::write(temp.join("a.txt"), "foo\nfoo\nbar\n").expect("write file");

        let result = tool_grep(
            temp.to_string_lossy().into_owned(),
            "foo".to_string(),
            None,
            None,
            Some("count".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
            Some(true),
            None,
            None,
        )
        .expect("grep");

        let counts = result.counts.expect("counts");
        assert_eq!(counts.len(), 1);
        assert_eq!(counts[0].count, 2);
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn content_mode_multiline_returns_all_matches() {
        let temp = temp_workspace("multiline-content");
        fs::write(temp.join("a.txt"), "foo\nbar\nfoo\n").expect("write file");

        let result = tool_grep(
            temp.to_string_lossy().into_owned(),
            "foo".to_string(),
            None,
            None,
            Some("content".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
            Some(true),
            None,
            None,
        )
        .expect("grep");

        let matches = result.matches.expect("matches");
        assert_eq!(matches.len(), 2);
        assert_eq!(result.total_matches, 2);
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_invalid_regex() {
        let temp = temp_workspace("invalid");
        let error = tool_grep(
            temp.to_string_lossy().into_owned(),
            "[invalid".to_string(),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .expect_err("invalid regex");
        assert!(error.contains("Invalid pattern"));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn skips_sensitive_paths() {
        let temp = temp_workspace("sensitive");
        fs::write(temp.join("id_rsa"), "needle").expect("write key");
        fs::write(temp.join("visible.ts"), "needle").expect("write visible");

        let result = tool_grep(
            temp.to_string_lossy().into_owned(),
            "needle".to_string(),
            None,
            None,
            Some("files_with_matches".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .expect("grep");

        assert_eq!(result.files.expect("files"), vec!["visible.ts".to_string()]);
        assert_eq!(result.skipped_files, Some(1));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn finds_tool_registration_in_project_workspace() {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let workspace = manifest.parent().expect("workspace root");

        let result = tool_grep(
            workspace.to_string_lossy().into_owned(),
            "tool_glob".to_string(),
            Some("backend/src".to_string()),
            Some("**/*.rs".to_string()),
            Some("files_with_matches".to_string()),
            None,
            None,
            None,
            None,
            Some(10),
            None,
            None,
            None,
            None,
        )
        .expect("grep project");

        let files = result.files.expect("files");
        assert!(files.iter().any(|path| path.ends_with("mod.rs")));
    }

    #[test]
    fn glob_filter_relative_to_path() {
        // BUG-1: the `glob` filter is matched relative to `path`, so a pattern
        // anchored to a subdir of `path` must match.
        let temp = temp_workspace("grep-bug1");
        fs::create_dir_all(temp.join("a/b")).expect("create dirs");
        fs::write(temp.join("a/b/file.txt"), "needle").expect("write nested");
        fs::write(temp.join("top.txt"), "needle").expect("write top");

        let result = tool_grep(
            temp.to_string_lossy().into_owned(),
            "needle".to_string(),
            Some(".".to_string()),
            Some("a/**/*.txt".to_string()),
            Some("files_with_matches".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .expect("grep bug1");

        let files = result.files.expect("files");
        assert_eq!(files, vec!["a/b/file.txt".to_string()]);
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn show_hidden_includes_dotfiles() {
        // BUG-2: grep skips dotfiles unless show_hidden is set.
        // Note: `.env` is treated as a sensitive path and skipped regardless,
        // so we use a non-sensitive hidden name here.
        let temp = temp_workspace("grep-hidden");
        fs::write(temp.join(".hidden_file"), "needle").expect("write hidden");
        fs::write(temp.join("visible.txt"), "needle").expect("write visible");

        let off = tool_grep(
            temp.to_string_lossy().into_owned(),
            "needle".to_string(),
            None,
            None,
            Some("files_with_matches".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            Some(false),
        )
        .expect("grep hidden off");
        assert!(!off.files.expect("files").iter().any(|f| f == ".hidden_file"));

        let on = tool_grep(
            temp.to_string_lossy().into_owned(),
            "needle".to_string(),
            None,
            None,
            Some("files_with_matches".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            Some(true),
        )
        .expect("grep hidden on");
        assert!(on.files.expect("files").iter().any(|f| f == ".hidden_file"));
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn symlink_not_duplicated() {
        // BUG-3: a symlink to a file must not produce a duplicate result.
        let temp = temp_workspace("grep-symlink");
        fs::write(temp.join("target.txt"), "needle").expect("write target");
        #[cfg(unix)]
        std::os::unix::fs::symlink("target.txt", temp.join("link.txt")).expect("symlink");

        #[cfg(unix)]
        {
            let result = tool_grep(
                temp.to_string_lossy().into_owned(),
                "needle".to_string(),
                None,
                None,
                Some("content".to_string()),
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            )
            .expect("grep symlink");
            assert_eq!(result.total_matches, 1);
        }
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn searches_lines_around_null_bytes() {
        // BUG-5: a NUL byte in one line must not skip the whole file; the NUL
        // line is dropped but surrounding text lines are still searched.
        let temp = temp_workspace("grep-null");
        fs::write(
            temp.join("mixed.txt"),
            "valid text line\nnull\x00byte\ntext line 3\n",
        )
        .expect("write mixed");

        let before = tool_grep(
            temp.to_string_lossy().into_owned(),
            "valid text".to_string(),
            None,
            None,
            Some("content".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .expect("grep before null");
        assert_eq!(before.total_matches, 1);

        let after = tool_grep(
            temp.to_string_lossy().into_owned(),
            "text line 3".to_string(),
            None,
            None,
            Some("content".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .expect("grep after null");
        assert_eq!(after.total_matches, 1);

        let nul_line = tool_grep(
            temp.to_string_lossy().into_owned(),
            "byte".to_string(),
            None,
            None,
            Some("content".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .expect("grep nul line");
        assert_eq!(nul_line.total_matches, 0);
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn empty_file_yields_zero_width_match_for_dot_star() {
        // BUG-6: `.*` against an empty file should still report one match.
        let temp = temp_workspace("grep-empty");
        fs::write(temp.join("empty.txt"), "").expect("write empty");

        let result = tool_grep(
            temp.to_string_lossy().into_owned(),
            ".*".to_string(),
            None,
            None,
            Some("content".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .expect("grep empty");
        assert_eq!(result.total_matches, 1);
        let matches = result.matches.expect("matches");
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].line_number, 1);
        assert_eq!(matches[0].line, "");
        let _ = fs::remove_dir_all(temp);
    }
}
