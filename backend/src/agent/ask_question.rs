use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AskQuestionAnswer {
    pub question_id: String,
    pub prompt: String,
    pub allow_multiple: bool,
    pub selected_option_ids: Vec<String>,
    pub selected_option_labels: Vec<String>,
    pub other_text: Option<String>,
}

struct PendingAskQuestion {
    responder: oneshot::Sender<Result<Vec<AskQuestionAnswer>, String>>,
}

pub struct AskQuestionRegistry {
    pending: Mutex<HashMap<String, PendingAskQuestion>>,
}

impl AskQuestionRegistry {
    pub fn new() -> Self {
        Self {
            pending: Mutex::new(HashMap::new()),
        }
    }

    pub fn register(
        &self,
        task_id: &str,
    ) -> Result<oneshot::Receiver<Result<Vec<AskQuestionAnswer>, String>>, String> {
        let trimmed = task_id.trim();
        if trimmed.is_empty() {
            return Err("task_id is required".to_string());
        }

        let (tx, rx) = oneshot::channel();
        let mut pending = self
            .pending
            .lock()
            .map_err(|_| "Ask-question registry lock poisoned".to_string())?;
        if pending.contains_key(trimmed) {
            return Err(format!(
                "Task {trimmed} already has a pending ask_question request"
            ));
        }
        pending.insert(
            trimmed.to_string(),
            PendingAskQuestion { responder: tx },
        );
        Ok(rx)
    }

    pub fn submit(&self, task_id: &str, answers: Vec<AskQuestionAnswer>) -> Result<bool, String> {
        let trimmed = task_id.trim();
        if trimmed.is_empty() {
            return Err("task_id is required".to_string());
        }
        let pending = self
            .pending
            .lock()
            .map_err(|_| "Ask-question registry lock poisoned".to_string())?
            .remove(trimmed);
        let Some(entry) = pending else {
            return Ok(false);
        };
        let _ = entry.responder.send(Ok(answers));
        Ok(true)
    }

    pub fn cancel(&self, task_id: &str, message: impl Into<String>) -> Result<bool, String> {
        let trimmed = task_id.trim();
        if trimmed.is_empty() {
            return Err("task_id is required".to_string());
        }
        let pending = self
            .pending
            .lock()
            .map_err(|_| "Ask-question registry lock poisoned".to_string())?
            .remove(trimmed);
        let Some(entry) = pending else {
            return Ok(false);
        };
        let _ = entry.responder.send(Err(message.into()));
        Ok(true)
    }
}

impl Default for AskQuestionRegistry {
    fn default() -> Self {
        Self::new()
    }
}
