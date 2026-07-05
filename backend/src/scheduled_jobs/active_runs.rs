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
        self.runs
            .lock()
            .unwrap()
            .insert(run.job_id.clone(), run);
    }

    pub fn unregister(&self, job_id: &str) {
        self.runs.lock().unwrap().remove(job_id);
    }

    pub fn list(&self) -> Vec<ActiveScheduledRun> {
        self.runs.lock().unwrap().values().cloned().collect()
    }
}

pub type SharedActiveRunRegistry = Arc<ActiveRunRegistry>;
