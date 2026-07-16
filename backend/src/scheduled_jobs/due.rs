use chrono::{Datelike, TimeZone, Timelike, Utc};

use super::types::{JobRunRecord, RunStatus, ScheduledJobRecord, STALE_RUN_MS};

const CATCH_UP_WINDOW_MS: i64 = 7 * 24 * 60 * 60 * 1000;

#[derive(Clone, Debug)]
struct CronField {
    allowed: Vec<bool>,
}

impl CronField {
    fn new(max_inclusive: usize) -> Self {
        Self {
            allowed: vec![false; max_inclusive + 1],
        }
    }

    fn matches(&self, value: usize) -> bool {
        self.allowed.get(value).copied().unwrap_or(false)
    }

    fn set_range(
        &mut self,
        start: usize,
        end: usize,
        step: usize,
        min: usize,
        max: usize,
    ) -> bool {
        if start < min || end > max || start > end || step == 0 {
            return false;
        }
        let mut current = start;
        while current <= end {
            self.allowed[current] = true;
            match current.checked_add(step) {
                Some(next) if next > current => current = next,
                _ => break,
            }
        }
        true
    }

    fn set_all(&mut self, min: usize, max: usize, step: usize) -> bool {
        self.set_range(min, max, step, min, max)
    }
}

#[derive(Clone, Debug)]
struct CronSchedule {
    minute: CronField,
    hour: CronField,
    day_of_month: CronField,
    month: CronField,
    weekday: CronField,
}

impl CronSchedule {
    fn matches(&self, timestamp_ms: i64) -> bool {
        let Some(dt) = Utc.timestamp_millis_opt(timestamp_ms).single() else {
            return false;
        };
        self.minute.matches(dt.minute() as usize)
            && self.hour.matches(dt.hour() as usize)
            && self.day_of_month.matches(dt.day() as usize)
            && self.month.matches(dt.month() as usize)
            && self.weekday.matches(dt.weekday().num_days_from_sunday() as usize)
    }
}

fn parse_schedule(expression: &str) -> Option<CronSchedule> {
    let trimmed = expression.trim();
    if trimmed.is_empty() {
        return None;
    }

    let tokens = trimmed.split_whitespace().collect::<Vec<_>>();
    let fields = match tokens.len() {
        5 => tokens,
        6 => tokens.into_iter().skip(1).collect(),
        _ => return None,
    };

    Some(CronSchedule {
        minute: parse_field(fields[0], 0, 59, false)?,
        hour: parse_field(fields[1], 0, 23, false)?,
        day_of_month: parse_field(fields[2], 1, 31, false)?,
        month: parse_field(fields[3], 1, 12, false)?,
        weekday: parse_field(fields[4], 0, 7, true)?,
    })
}

fn parse_field(spec: &str, min: usize, max: usize, wrap_sunday: bool) -> Option<CronField> {
    let mut field = CronField::new(if wrap_sunday { 6 } else { max });
    for segment in spec.split(',') {
        if !apply_segment(&mut field, segment.trim(), min, max, wrap_sunday) {
            return None;
        }
    }
    Some(field)
}

fn apply_segment(
    field: &mut CronField,
    segment: &str,
    min: usize,
    max: usize,
    wrap_sunday: bool,
) -> bool {
    if segment.is_empty() {
        return false;
    }

    let (base, step) = match segment.split_once('/') {
        Some((left, right)) => {
            let Some(parsed_step) = right.parse::<usize>().ok() else {
                return false;
            };
            (left, parsed_step)
        }
        None => (segment, 1),
    };

    if base == "*" {
        return field.set_all(min, normalize_upper_bound(max, wrap_sunday), step);
    }

    if let Some((start, end)) = base.split_once('-') {
        let Some(start) = parse_value(start, min, max, wrap_sunday) else {
            return false;
        };
        let Some(end) = parse_value(end, min, max, wrap_sunday) else {
            return false;
        };
        return field.set_range(start, end, step, min, normalize_upper_bound(max, wrap_sunday));
    }

    let Some(value) = parse_value(base, min, max, wrap_sunday) else {
        return false;
    };
    field.set_range(value, value, 1, min, normalize_upper_bound(max, wrap_sunday))
}

fn parse_value(raw: &str, min: usize, max: usize, wrap_sunday: bool) -> Option<usize> {
    let parsed = raw.parse::<usize>().ok()?;
    if parsed < min || parsed > max {
        return None;
    }
    if wrap_sunday && parsed == 7 {
        return Some(0);
    }
    Some(parsed)
}

fn normalize_upper_bound(max: usize, wrap_sunday: bool) -> usize {
    if wrap_sunday { 6 } else { max }
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

    let Some(schedule) = parse_schedule(expression) else {
        return false;
    };

    let reference = last_finished_run_at(job).unwrap_or(job.created_at);
    let mut candidate = align_to_next_minute(reference.max(now_ms - CATCH_UP_WINDOW_MS));
    let last_now_minute = align_to_minute(now_ms);

    while candidate <= last_now_minute {
        if schedule.matches(candidate) {
            return true;
        }
        candidate += 60_000;
    }

    false
}

pub fn is_blocking_running_run(run: &JobRunRecord, now_ms: i64) -> bool {
    run.status == RunStatus::Running && now_ms - run.started_at < STALE_RUN_MS
}

pub fn stale_running_runs(job: &ScheduledJobRecord, now_ms: i64) -> Vec<&JobRunRecord> {
    job.runs
        .iter()
        .filter(|run| run.status == RunStatus::Running && !is_blocking_running_run(run, now_ms))
        .collect()
}

fn last_finished_run_at(job: &ScheduledJobRecord) -> Option<i64> {
    job.runs
        .iter()
        .filter(|run| run.status != RunStatus::Running)
        .filter_map(|run| run.completed_at.or(Some(run.started_at)))
        .max()
}

fn align_to_minute(timestamp_ms: i64) -> i64 {
    timestamp_ms - timestamp_ms.rem_euclid(60_000)
}

fn align_to_next_minute(timestamp_ms: i64) -> i64 {
    let aligned = align_to_minute(timestamp_ms);
    if aligned == timestamp_ms {
        timestamp_ms + 60_000
    } else {
        aligned + 60_000
    }
}

#[cfg(test)]
mod tests {
    use super::{is_job_due, parse_schedule};
    use crate::scheduled_jobs::types::{AgentMode, JobRunRecord, RunStatus, ScheduledJobRecord};

    #[test]
    fn normalize_five_field_unix_cron() {
        assert!(parse_schedule("* * * * *").is_some());
        assert!(parse_schedule("0 * * * * *").is_some());
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
            description: String::new(),
            cron_expression: "* * * * *".into(),
            prompt: "hi".into(),
            workspace_dir: None,
            model: "m".into(),
            provider: "deepseek".into(),
            agent_mode: AgentMode::Ask,
            thinking_enabled: false,
            enabled: true,
            runs: vec![JobRunRecord {
                id: "task-1".into(),
                task_id: "task-1".into(),
                session_id: "session-1".into(),
                started_at: 1_783_232_430_346 - 1000,
                completed_at: Some(1_783_232_430_346),
                summary: "done".into(),
                status: RunStatus::Completed,
            }],
            created_at: 1_783_229_542_309,
            updated_at: 1_783_232_430_346,
        };

        assert!(is_job_due(&job, 1_783_233_828_852));
    }
}
