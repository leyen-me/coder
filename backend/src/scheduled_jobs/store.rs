use std::sync::{Arc, Mutex};

use uuid::Uuid;

use crate::db::{Database, IndexEntry};

use super::types::{
    CreateJobInput, JobRunRecord, RunStatus, ScheduledJobRecord, UpdateJobInput, MAX_RUNS, STORE,
};

fn updated_at_index(updated_at: i64) -> Vec<IndexEntry> {
    vec![IndexEntry {
        name: "by-updatedAt".to_string(),
        value: updated_at.to_string(),
    }]
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub fn list_jobs(db: &Arc<Mutex<Database>>) -> Result<Vec<ScheduledJobRecord>, String> {
    let db = db.lock().map_err(|_| "Database lock poisoned".to_string())?;
    let mut items = db.get_all::<ScheduledJobRecord>(STORE)?;
    items = items
        .into_iter()
        .map(ScheduledJobRecord::normalize)
        .collect();
    items.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(items)
}

pub fn list_enabled_jobs(db: &Arc<Mutex<Database>>) -> Result<Vec<ScheduledJobRecord>, String> {
    Ok(list_jobs(db)?
        .into_iter()
        .filter(|job| job.enabled)
        .collect())
}

pub fn get_job(db: &Arc<Mutex<Database>>, id: &str) -> Result<Option<ScheduledJobRecord>, String> {
    let db = db.lock().map_err(|_| "Database lock poisoned".to_string())?;
    db.get(STORE, id)
        .map(|value| value.map(ScheduledJobRecord::normalize))
}

pub fn create_job(
    db: &Arc<Mutex<Database>>,
    input: CreateJobInput,
) -> Result<ScheduledJobRecord, String> {
    let now = now_ms();
    let record = ScheduledJobRecord {
        id: Uuid::new_v4().to_string(),
        name: input.name.trim().to_string(),
        description: input.description.trim().to_string(),
        cron_expression: input.cron_expression.trim().to_string(),
        prompt: input.prompt.trim().to_string(),
        workspace_dir: normalize_optional_string(input.workspace_dir),
        model: input.model.trim().to_string(),
        provider: input
            .provider
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_default(),
        agent_mode: input.agent_mode,
        thinking_enabled: input.thinking_enabled,
        enabled: true,
        runs: Vec::new(),
        created_at: now,
        updated_at: now,
    };
    let normalized = record.normalize();
    put_job(db, &normalized)?;
    Ok(normalized)
}

pub fn update_job(
    db: &Arc<Mutex<Database>>,
    id: &str,
    patch: UpdateJobInput,
) -> Result<Option<ScheduledJobRecord>, String> {
    let Some(existing) = get_job(db, id)? else {
        return Ok(None);
    };

    let record = ScheduledJobRecord {
        id: existing.id,
        name: patch
            .name
            .map(|value| value.trim().to_string())
            .unwrap_or(existing.name),
        description: patch
            .description
            .map(|value| value.trim().to_string())
            .unwrap_or(existing.description),
        cron_expression: patch
            .cron_expression
            .map(|value| value.trim().to_string())
            .unwrap_or(existing.cron_expression),
        prompt: patch
            .prompt
            .map(|value| value.trim().to_string())
            .unwrap_or(existing.prompt),
        workspace_dir: patch
            .workspace_dir
            .map(|value| normalize_optional_string(Some(value)))
            .unwrap_or(existing.workspace_dir),
        model: patch
            .model
            .map(|value| value.trim().to_string())
            .unwrap_or(existing.model),
        provider: patch
            .provider
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or(existing.provider),
        agent_mode: patch.agent_mode.unwrap_or(existing.agent_mode),
        thinking_enabled: patch.thinking_enabled.unwrap_or(existing.thinking_enabled),
        enabled: patch.enabled.unwrap_or(existing.enabled),
        runs: existing.runs,
        created_at: existing.created_at,
        updated_at: now_ms(),
    };

    let normalized = record.normalize();
    put_job(db, &normalized)?;
    Ok(Some(normalized))
}

pub fn delete_job(db: &Arc<Mutex<Database>>, id: &str) -> Result<bool, String> {
    let db = db.lock().map_err(|_| "Database lock poisoned".to_string())?;
    if db.get::<ScheduledJobRecord>(STORE, id)?.is_none() {
        return Ok(false);
    }
    db.delete(STORE, id)?;
    Ok(true)
}

pub fn start_job_run(
    db: &Arc<Mutex<Database>>,
    job_id: &str,
    task_id: &str,
    session_id: &str,
) -> Result<Option<ScheduledJobRecord>, String> {
    let Some(existing) = get_job(db, job_id)? else {
        return Ok(None);
    };

    let now = now_ms();
    let run = JobRunRecord {
        id: task_id.to_string(),
        task_id: task_id.to_string(),
        session_id: session_id.to_string(),
        started_at: now,
        completed_at: None,
        summary: String::new(),
        status: RunStatus::Running,
    };

    let mut runs = existing.runs;
    runs.insert(0, run);
    if runs.len() > MAX_RUNS {
        runs.truncate(MAX_RUNS);
    }

    let next = ScheduledJobRecord {
        runs,
        updated_at: now,
        ..existing
    };
    put_job(db, &next)?;
    Ok(Some(next))
}

pub fn finish_job_run(
    db: &Arc<Mutex<Database>>,
    job_id: &str,
    task_id: &str,
    summary: String,
    status: RunStatus,
) -> Result<Option<ScheduledJobRecord>, String> {
    let Some(existing) = get_job(db, job_id)? else {
        return Ok(None);
    };

    let now = now_ms();
    let mut found = false;
    let runs = existing
        .runs
        .into_iter()
        .map(|mut run| {
            if run.task_id == task_id {
                found = true;
                run.completed_at = Some(now);
                run.summary = summary.clone();
                run.status = status.clone();
            }
            run
        })
        .collect::<Vec<_>>();

    let next_runs = if found {
        runs
    } else {
        let mut merged = vec![JobRunRecord {
            id: task_id.to_string(),
            task_id: task_id.to_string(),
            session_id: String::new(),
            started_at: now,
            completed_at: Some(now),
            summary: summary.clone(),
            status: status.clone(),
        }];
        merged.extend(runs);
        if merged.len() > MAX_RUNS {
            merged.truncate(MAX_RUNS);
        }
        merged
    };

    let next = ScheduledJobRecord {
        runs: next_runs,
        updated_at: now,
        ..existing
    };
    put_job(db, &next)?;
    Ok(Some(next))
}

fn put_job(db: &Arc<Mutex<Database>>, record: &ScheduledJobRecord) -> Result<(), String> {
    let db = db.lock().map_err(|_| "Database lock poisoned".to_string())?;
    db.put(STORE, &record.id, record, &updated_at_index(record.updated_at))
}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}
