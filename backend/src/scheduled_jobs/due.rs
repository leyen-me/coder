use chrono::{DateTime, Local, Utc};
use cron::Schedule;
use std::str::FromStr;

use super::types::{JobRunRecord, RunStatus, ScheduledJobRecord};

pub fn is_job_due(job: &ScheduledJobRecord, now_ms: i64) -> bool {
    if job
        .runs
        .iter()
        .any(|run| is_blocking_running_run(run, now_ms))
    {
        return false;
    }

    let expression = job.cron_expression.trim();
    if expression.is_empty() {
        return false;
    }

    let schedule = match Schedule::from_str(expression) {
        Ok(value) => value,
        Err(_) => return false,
    };

    let now: DateTime<Utc> = DateTime::from_timestamp_millis(now_ms)
        .unwrap_or_else(Utc::now)
        .with_timezone(&Utc);

    let reference_start = DateTime::from_timestamp_millis(job.created_at)
        .unwrap_or(now)
        .with_timezone(&Utc);

    let prev = schedule
        .after(&reference_start)
        .take_while(|occurrence| *occurrence <= now)
        .last();

    let Some(prev) = prev else {
        return false;
    };
    let prev_ms = prev.timestamp_millis();

    match last_finished_run_at(job) {
        None => prev_ms > job.created_at,
        Some(last_run_at) => prev_ms > last_run_at,
    }
}

pub fn is_blocking_running_run(run: &JobRunRecord, now_ms: i64) -> bool {
    run.status == RunStatus::Running && now_ms - run.started_at < super::types::STALE_RUN_MS
}

pub fn stale_running_runs(job: &ScheduledJobRecord, now_ms: i64) -> Vec<&JobRunRecord> {
    job.runs
        .iter()
        .filter(|run| run.status == RunStatus::Running && !is_blocking_running_run(run, now_ms))
        .collect()
}

fn last_finished_run_at(job: &ScheduledJobRecord) -> Option<i64> {
    let finished: Vec<i64> = job
        .runs
        .iter()
        .filter(|run| run.status != RunStatus::Running)
        .filter_map(|run| run.completed_at.or(Some(run.started_at)))
        .collect();
    finished.into_iter().max()
}

pub fn format_local_date() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}
