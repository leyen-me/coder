use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveScheduledRun {
    pub job_id: String,
    pub session_id: String,
    pub assistant_message_id: String,
    pub task_id: String,
}

#[derive(Default)]
pub struct ActiveRunRegistry {
    runs: Mutex<HashMap<String, ActiveScheduledRun>>,
}

impl ActiveRunRegistry {
    pub fn new() -> Self {
        Self {
            runs: Mutex::new(HashMap::new()),
        }
    }

    pub fn register(&self, run: ActiveScheduledRun) {
        self.runs.lock().unwrap().insert(run.job_id.clone(), run);
    }

    pub fn unregister(&self, job_id: &str) -> Option<ActiveScheduledRun> {
        self.runs.lock().unwrap().remove(job_id)
    }

    pub fn list(&self) -> Vec<ActiveScheduledRun> {
        self.runs.lock().unwrap().values().cloned().collect()
    }

    pub fn get_by_job_id(&self, job_id: &str) -> Option<ActiveScheduledRun> {
        self.runs.lock().unwrap().get(job_id).cloned()
    }

    pub fn find_by_task_or_session(&self, value: &str) -> Option<ActiveScheduledRun> {
        self.runs
            .lock()
            .unwrap()
            .values()
            .find(|run| run.task_id == value || run.session_id == value)
            .cloned()
    }
}

pub type SharedActiveRunRegistry = Arc<ActiveRunRegistry>;
