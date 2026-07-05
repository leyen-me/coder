use std::sync::Mutex;

use serde::Deserialize;

use crate::db::Database;

use super::system_skills::{
    resolve_enabled_system_skills, SystemSkillDefinition, SystemSkillPreferenceRecord,
};

#[derive(Debug, Clone)]
pub struct RemoteTargetSummary {
    pub alias: String,
    pub host: String,
    pub port: u16,
    pub user: String,
}

#[derive(Debug, Clone, Default)]
pub struct PromptContext {
    pub enabled_system_skills: Vec<SystemSkillDefinition>,
    pub remote_targets: Vec<RemoteTargetSummary>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteTargetRecord {
    alias: String,
    host: String,
    port: u16,
    user: String,
    enabled: bool,
}

pub fn load_prompt_context(db: &Mutex<Database>) -> Result<PromptContext, String> {
    let db = db.lock().map_err(|_| "Database lock poisoned".to_string())?;
    let preferences = db.get_all::<SystemSkillPreferenceRecord>("systemSkillPreferences")?;
    let remote_targets = db
        .get_all::<RemoteTargetRecord>("remoteTargets")?
        .into_iter()
        .filter(|target| target.enabled)
        .map(|target| RemoteTargetSummary {
            alias: target.alias,
            host: target.host,
            port: target.port,
            user: target.user,
        })
        .collect();

    Ok(PromptContext {
        enabled_system_skills: resolve_enabled_system_skills(&preferences),
        remote_targets,
    })
}
