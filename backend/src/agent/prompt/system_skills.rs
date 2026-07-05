use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSkillDefinition {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub content: String,
    pub default_enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSkillPreferenceRecord {
    pub skill_id: String,
    pub enabled: bool,
}

pub fn all_system_skills() -> Vec<SystemSkillDefinition> {
    serde_json::from_str(include_str!("assets/system_skills.json")).unwrap_or_default()
}

pub fn resolve_enabled_system_skills(
    preferences: &[SystemSkillPreferenceRecord],
) -> Vec<SystemSkillDefinition> {
    let preference_map: HashMap<&str, bool> = preferences
        .iter()
        .map(|preference| (preference.skill_id.as_str(), preference.enabled))
        .collect();

    all_system_skills()
        .into_iter()
        .filter(|skill| {
            preference_map
                .get(skill.id.as_str())
                .copied()
                .unwrap_or(skill.default_enabled)
        })
        .collect()
}

pub fn build_system_skill_block(skill: &SystemSkillDefinition) -> String {
    format!(
        "## {}\n\n{}",
        skill.name,
        strip_leading_markdown_h1(&skill.content)
    )
}

fn strip_leading_markdown_h1(content: &str) -> String {
    let mut lines = content.lines();
    if let Some(first) = lines.next() {
        if first.trim_start().starts_with('#') {
            return lines
                .skip_while(|line| line.trim().is_empty())
                .collect::<Vec<_>>()
                .join("\n")
                .trim()
                .to_string();
        }
    }

    content.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_system_skills_are_valid() {
        let skills = all_system_skills();
        assert_eq!(skills.len(), 10);
        assert!(skills.iter().any(|skill| skill.slug == "agent-operating-principles"));
    }

    #[test]
    fn preferences_override_defaults() {
        let skills = resolve_enabled_system_skills(&[SystemSkillPreferenceRecord {
            skill_id: "code-review".to_string(),
            enabled: true,
        }]);

        assert!(skills.iter().any(|skill| skill.slug == "code-review"));
    }

    #[test]
    fn strips_duplicate_heading_from_skill_content() {
        let block = build_system_skill_block(&SystemSkillDefinition {
            id: "test".to_string(),
            slug: "test".to_string(),
            name: "Tool Usage".to_string(),
            content: "# Tool Usage\n\nUse tools wisely.".to_string(),
            default_enabled: true,
        });

        assert!(block.contains("## Tool Usage"));
        assert!(block.contains("Use tools wisely."));
        assert!(!block.contains("# Tool Usage\n\n# Tool Usage"));
    }
}
