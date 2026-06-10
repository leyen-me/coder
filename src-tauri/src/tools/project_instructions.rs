use std::fs;
use std::path::Path;

use serde::Serialize;

pub const AGENTS_MD_FILENAME: &str = "AGENTS.md";
const MAX_AGENTS_MD_BYTES: usize = 32 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentsMdContent {
    pub path: String,
    pub content: String,
    pub truncated: bool,
}

/// Loads `AGENTS.md` from the workspace root when present.
pub fn load_workspace_agents_md(workspace_dir: &str) -> Result<Option<AgentsMdContent>, String> {
    let trimmed = workspace_dir.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let workspace = Path::new(trimmed);
    let agents_path = workspace.join(AGENTS_MD_FILENAME);

    if !agents_path.is_file() {
        return Ok(None);
    }

    let bytes = fs::read(&agents_path)
        .map_err(|error| format!("Failed to read {AGENTS_MD_FILENAME}: {error}"))?;

    let truncated = bytes.len() > MAX_AGENTS_MD_BYTES;
    let slice = if truncated {
        &bytes[..MAX_AGENTS_MD_BYTES]
    } else {
        &bytes[..]
    };

    let content = String::from_utf8(slice.to_vec())
        .map_err(|error| format!("{AGENTS_MD_FILENAME} is not valid UTF-8: {error}"))?;

    Ok(Some(AgentsMdContent {
        path: AGENTS_MD_FILENAME.to_string(),
        content,
        truncated,
    }))
}

#[cfg(test)]
mod tests {
    use super::{
        load_workspace_agents_md, AGENTS_MD_FILENAME, MAX_AGENTS_MD_BYTES,
    };
    use std::fs;
    use std::path::PathBuf;

    fn temp_workspace(name: &str) -> PathBuf {
        let temp = std::env::temp_dir().join(format!(
            "coder-project-instructions-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&temp).expect("create temp dir");
        temp
    }

    #[test]
    fn returns_none_when_file_missing() {
        let temp = temp_workspace("missing");
        let result = load_workspace_agents_md(temp.to_string_lossy().as_ref())
            .expect("load should not error");
        assert!(result.is_none());
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn returns_none_for_empty_workspace_dir() {
        let result = load_workspace_agents_md("   ").expect("load should not error");
        assert!(result.is_none());
    }

    #[test]
    fn loads_existing_agents_md() {
        let temp = temp_workspace("exists");
        let content = "## Rules\nFollow the style guide.";
        fs::write(temp.join(AGENTS_MD_FILENAME), content).expect("write agents md");

        let loaded = load_workspace_agents_md(temp.to_string_lossy().as_ref())
            .expect("load should succeed")
            .expect("agents md should exist");

        assert_eq!(loaded.path, AGENTS_MD_FILENAME);
        assert_eq!(loaded.content, content);
        assert!(!loaded.truncated);
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn truncates_large_agents_md() {
        let temp = temp_workspace("truncate");
        let large = "x".repeat(MAX_AGENTS_MD_BYTES + 100);
        fs::write(temp.join(AGENTS_MD_FILENAME), large).expect("write large agents md");

        let loaded = load_workspace_agents_md(temp.to_string_lossy().as_ref())
            .expect("load should succeed")
            .expect("agents md should exist");

        assert!(loaded.truncated);
        assert_eq!(loaded.content.len(), MAX_AGENTS_MD_BYTES);
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn rejects_invalid_utf8() {
        let temp = temp_workspace("utf8");
        fs::write(temp.join(AGENTS_MD_FILENAME), &[0xff, 0xfe, 0xfd])
            .expect("write invalid utf8");

        let error = load_workspace_agents_md(temp.to_string_lossy().as_ref()).expect_err("utf8");
        assert!(error.contains("UTF-8"));
        let _ = fs::remove_dir_all(temp);
    }
}
