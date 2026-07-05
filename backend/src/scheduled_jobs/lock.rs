use std::collections::HashSet;
use std::sync::{Arc, Mutex};

#[derive(Default)]
pub struct RunLock {
    running: Mutex<HashSet<String>>,
}

impl RunLock {
    pub fn new() -> Self {
        Self {
            running: Mutex::new(HashSet::new()),
        }
    }

    pub fn try_acquire(&self, job_id: &str) -> bool {
        let mut guard = self.running.lock().unwrap();
        if guard.contains(job_id) {
            return false;
        }
        guard.insert(job_id.to_string());
        true
    }

    pub fn release(&self, job_id: &str) {
        let mut guard = self.running.lock().unwrap();
        guard.remove(job_id);
    }

    pub fn running_ids(&self) -> Vec<String> {
        self.running.lock().unwrap().iter().cloned().collect()
    }
}

pub type SharedRunLock = Arc<RunLock>;
