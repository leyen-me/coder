use std::sync::Mutex;

use serde_json::{json, Value};

use crate::db::{Database, IndexEntry};

fn tool_state_rank(state: &str) -> u8 {
    match state {
        "input-streaming" => 0,
        "input-available" => 1,
        "output-available" | "output-error" => 2,
        _ => 0,
    }
}

fn normalize_tool_invocations(value: Option<&Value>) -> Vec<Value> {
    value
        .and_then(|items| items.as_array())
        .cloned()
        .unwrap_or_default()
}

fn merge_tool_invocations(existing: &[Value], incoming: &Value) -> Vec<Value> {
    let incoming_id = incoming
        .get("id")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    if incoming_id.is_empty() {
        return existing.to_vec();
    }

    let mut merged: Vec<Value> = existing.to_vec();
    if let Some(index) = merged
        .iter()
        .position(|item| item.get("id").and_then(|value| value.as_str()) == Some(incoming_id))
    {
        let previous_state = merged[index]
            .get("state")
            .and_then(|value| value.as_str())
            .unwrap_or("input-streaming");
        let next_state = incoming
            .get("state")
            .and_then(|value| value.as_str())
            .unwrap_or("input-streaming");
        if tool_state_rank(next_state) >= tool_state_rank(previous_state) {
            merged[index] = incoming.clone();
        }
    } else {
        merged.push(incoming.clone());
    }

    merged
}

fn put_message_record(db: &Database, message: &Value) -> Result<(), String> {
    let id = message
        .get("id")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Message id is required".to_string())?;
    let session_id = message
        .get("sessionId")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let created_at = message
        .get("createdAt")
        .and_then(|value| value.as_i64())
        .unwrap_or(0);

    db.put(
        super::types::MESSAGES_STORE,
        id,
        message,
        &[
            IndexEntry {
                name: "by-sessionId".to_string(),
                value: session_id.to_string(),
            },
            IndexEntry {
                name: "by-sessionId-createdAt".to_string(),
                value: format!("{session_id}:{created_at:020}"),
            },
        ],
    )
    .map_err(|error| error.to_string())
}

pub fn upsert_message_tool_invocation(
    db: &Mutex<Database>,
    message_id: &str,
    invocation: Value,
) -> Result<(), String> {
    let db = db.lock().map_err(|_| "Database lock poisoned".to_string())?;
    let mut message: Value = db
        .get(super::types::MESSAGES_STORE, message_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("Message not found: {message_id}"))?;

    let existing = normalize_tool_invocations(message.get("toolInvocations"));
    message["toolInvocations"] = Value::Array(merge_tool_invocations(&existing, &invocation));
    put_message_record(&db, &message)
}

pub fn complete_message_tool_invocation(
    db: &Mutex<Database>,
    message_id: &str,
    tool_call_id: &str,
    state: &str,
    output: Option<Value>,
    error_text: Option<String>,
) -> Result<(), String> {
    let db = db.lock().map_err(|_| "Database lock poisoned".to_string())?;
    let mut message: Value = db
        .get(super::types::MESSAGES_STORE, message_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("Message not found: {message_id}"))?;

    let invocations = normalize_tool_invocations(message.get("toolInvocations"));
    let updated: Vec<Value> = invocations
        .into_iter()
        .map(|mut invocation| {
            if invocation.get("id").and_then(|value| value.as_str()) == Some(tool_call_id) {
                invocation["state"] = json!(state);
                if let Some(next_output) = output.clone() {
                    invocation["output"] = next_output;
                }
                if let Some(next_error) = error_text.clone() {
                    invocation["errorText"] = json!(next_error);
                }
            }
            invocation
        })
        .collect();

    message["toolInvocations"] = Value::Array(updated);
    put_message_record(&db, &message)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merge_tool_invocations_prefers_further_along_state() {
        let existing = vec![json!({
            "id": "call_1",
            "name": "shell",
            "input": {},
            "state": "input-streaming"
        })];
        let incoming = json!({
            "id": "call_1",
            "name": "shell",
            "input": { "command": "ls" },
            "state": "input-available"
        });

        let merged = merge_tool_invocations(&existing, &incoming);
        assert_eq!(merged[0]["state"], "input-available");
    }
}
