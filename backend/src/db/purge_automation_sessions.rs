use serde_json::Value;
use std::sync::{Arc, Mutex};

use super::Database;

const MESSAGES_STORE: &str = "messages";
const SESSIONS_STORE: &str = "sessions";
const SESSION_MESSAGES_INDEX: &str = "by-sessionId";

pub fn purge_automation_sessions(db: &Arc<Mutex<Database>>) -> Result<(), String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    let sessions = db.get_all::<Value>(SESSIONS_STORE)?;

    let mut purged_session_count = 0;
    let mut purged_message_count = 0;

    for session in sessions {
        let Some(session_id) = session.get("id").and_then(Value::as_str) else {
            continue;
        };
        let is_automation = session
            .get("sessionKind")
            .and_then(Value::as_str)
            .is_some_and(|kind| kind.trim() == "automation");
        if !is_automation {
            continue;
        }

        let messages =
            db.get_all_from_index::<Value>(MESSAGES_STORE, SESSION_MESSAGES_INDEX, Some(session_id))?;
        for message in messages {
            let Some(message_id) = message.get("id").and_then(Value::as_str) else {
                continue;
            };
            db.delete(MESSAGES_STORE, message_id)?;
            purged_message_count += 1;
        }

        db.delete(SESSIONS_STORE, session_id)?;
        purged_session_count += 1;
    }

    if purged_session_count > 0 || purged_message_count > 0 {
        log::info!(
            "Purged {purged_session_count} automation sessions and {purged_message_count} messages"
        );
    }

    Ok(())
}
