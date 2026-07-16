use std::sync::Arc;
use std::time::Duration;

use crate::AppState;

use super::due::{is_job_due, stale_running_runs};
use super::runner::queue_job_run;
use super::store::{finish_job_run, list_enabled_jobs};
use super::types::RunStatus;

pub fn spawn_scheduler(state: Arc<AppState>) {
    tokio::spawn(async move {
        let mut interval =
            tokio::time::interval(Duration::from_secs(super::types::SCHEDULER_INTERVAL_SECS));
        loop {
            interval.tick().await;
            if let Err(error) = tick(state.clone()).await {
                log::error!("[scheduled_jobs] scheduler tick failed: {error}");
            }
        }
    });
}

async fn tick(state: Arc<AppState>) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp_millis();
    let jobs = list_enabled_jobs(&state.db)?;

    for job in &jobs {
        for stale in stale_running_runs(job, now) {
            finish_job_run(
                &state.db,
                &job.id,
                &stale.task_id,
                "[failed] Run interrupted before completion".to_string(),
                RunStatus::Failed,
            )?;
        }
    }

    let refreshed = list_enabled_jobs(&state.db)?;
    for job in refreshed {
        if is_job_due(&job, now) {
            queue_job_run(state.clone(), job);
        }
    }

    Ok(())
}
