use chrono::{DateTime, Utc};
use cron::Schedule;
use std::str::FromStr;

use super::types::{JobRunRecord, RunStatus, ScheduledJobRecord};

/// Standard Unix cron uses 5 fields: minute hour day month weekday.
/// The Rust `cron` crate expects 6–7 fields: second minute hour day month weekday [year].
pub fn normalize_cron_expression(expression: &str) -> String {
    let trimmed = expression.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    match trimmed.split_whitespace().count() {
        5 => format!("0 {trimmed}"),
        _ => trimmed.to_string(),
    }
}

fn parse_schedule(expression: &str) -> Option<Schedule> {
    let normalized = normalize_cron_expression(expression);
    Schedule::from_str(&normalized).ok()
}

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

    let schedule = match parse_schedule(expression) {
        Some(value) => value,
        None => return false,
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

#[cfg(test)]
mod tests {
    use super::{is_job_due, normalize_cron_expression, parse_schedule};
    use crate::scheduled_jobs::types::{AgentMode, JobRunRecord, RunStatus, ScheduledJobRecord};

    #[test]
    fn normalize_five_field_unix_cron() {
        assert_eq!(normalize_cron_expression("* * * * *"), "0 * * * * *");
        assert_eq!(normalize_cron_expression("0 9 * * 1-5"), "0 0 9 * * 1-5");
        assert_eq!(normalize_cron_expression("0 0 * * * *"), "0 0 * * * *");
    }

    #[test]
    fn parses_standard_every_minute_expression() {
        assert!(parse_schedule("* * * * *").is_some());
    }

    #[test]
    fn every_minute_is_due_after_last_run() {
        let job = ScheduledJobRecord {
            id: "test".into(),
            name: "test".into(),
            description: "".into(),
            cron_expression: "* * * * *".into(),
            prompt: "hi".into(),
            workspace_dir: None,
            model: "m".into(),
            provider: "deepseek".into(),
            agent_mode: AgentMode::Ask,
            thinking_enabled: false,
            enabled: true,
            enable_email: false,
            runs: vec![JobRunRecord {
                id: "r1".into(),
                session_id: "r1".into(),
                started_at: 1783232430346 - 1000,
                completed_at: Some(1783232430346),
                summary: "done".into(),
                status: RunStatus::Completed,
            }],
            created_at: 1783229542309,
            updated_at: 1783232430346,
        };

        assert!(is_job_due(&job, 1783233828852));
    }
}
