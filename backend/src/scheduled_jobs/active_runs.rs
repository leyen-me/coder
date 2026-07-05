use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveScheduledRun {
    pub job_id: String,
    pub session_id: String,
    pub assistant_message_id: String,
    pub task_id: String,
}

struct ActiveRunEntry {
    run: ActiveScheduledRun,
    cancel: CancellationToken,
}

#[derive(Default)]
pub struct ActiveRunRegistry {
    runs: Mutex<HashMap<String, ActiveRunEntry>>,
}

impl ActiveRunRegistry {
    pub fn new() -> Self {
        Self {
            runs: Mutex::new(HashMap::new()),
        }
    }

    pub fn register(&self, run: ActiveScheduledRun, cancel: CancellationToken) {
        self.runs
            .lock()
            .unwrap()
            .insert(run.job_id.clone(), ActiveRunEntry { run, cancel });
    }

    pub fn unregister(&self, job_id: &str) {
        self.runs.lock().unwrap().remove(job_id);
    }

    pub fn list(&self) -> Vec<ActiveScheduledRun> {
        self.runs
            .lock()
            .unwrap()
            .values()
            .map(|entry| entry.run.clone())
            .collect()
    }

    pub fn cancel_by_job_id(&self, job_id: &str) -> Option<ActiveScheduledRun> {
        let runs = self.runs.lock().unwrap();
        runs.get(job_id).map(|entry| {
            entry.cancel.cancel();
            entry.run.clone()
        })
    }

    pub fn cancel_by_task_id(&self, task_id: &str) -> Option<ActiveScheduledRun> {
        let runs = self.runs.lock().unwrap();
        let job_id = runs.values().find_map(|entry| {
            if entry.run.task_id == task_id || entry.run.session_id == task_id {
                Some(entry.run.job_id.clone())
            } else {
                None
            }
        })?;
        runs.get(&job_id).map(|entry| {
            entry.cancel.cancel();
            entry.run.clone()
        })
    }
}

pub type SharedActiveRunRegistry = Arc<ActiveRunRegistry>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancel_by_task_id_cancels_matching_run() {
        let registry = ActiveRunRegistry::new();
        let cancel = CancellationToken::new();
        registry.register(
            ActiveScheduledRun {
                job_id: "job-1".to_string(),
                session_id: "session-1".to_string(),
                assistant_message_id: "assistant-1".to_string(),
                task_id: "session-1".to_string(),
            },
            cancel.clone(),
        );

        let run = registry.cancel_by_task_id("session-1");
        assert!(run.is_some());
        assert!(cancel.is_cancelled());
    }
}
