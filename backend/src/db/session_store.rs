use uuid::Uuid;

use super::{
    records::{
        current_timestamp_ms, normalize_todo_status, AgentTodoRecord, MessageRecord, SessionRecord,
        AGENT_TODOS_STORE, MESSAGES_STORE, SESSIONS_STORE,
    },
    Database, IndexEntry,
};

pub fn new_session_id() -> String {
    Uuid::new_v4().to_string()
}

pub fn new_message_id() -> String {
    Uuid::new_v4().to_string()
}

pub fn new_todo_id() -> String {
    Uuid::new_v4().to_string()
}

pub fn session_indexes(session: &SessionRecord) -> Vec<IndexEntry> {
    vec![IndexEntry {
        name: "by-updatedAt".to_string(),
        value: session.updated_at.to_string(),
    }]
}

pub fn message_indexes(message: &MessageRecord) -> Vec<IndexEntry> {
    vec![
        IndexEntry {
            name: "by-sessionId".to_string(),
            value: message.session_id.clone(),
        },
        IndexEntry {
            name: "by-sessionId-createdAt".to_string(),
            value: message.session_id.clone(),
        },
    ]
}

pub fn todo_indexes(todo: &AgentTodoRecord) -> Vec<IndexEntry> {
    vec![
        IndexEntry {
            name: "by-sessionId".to_string(),
            value: todo.session_id.clone(),
        },
        IndexEntry {
            name: "by-sessionId-order".to_string(),
            value: todo.session_id.clone(),
        },
    ]
}

pub fn get_session(db: &Database, session_id: &str) -> Result<Option<SessionRecord>, String> {
    db.get::<SessionRecord>(SESSIONS_STORE, session_id)
        .map(|value| value.map(SessionRecord::normalize))
}

pub fn put_session(db: &Database, session: &SessionRecord) -> Result<(), String> {
    let normalized = session.clone().normalize();
    db.put(SESSIONS_STORE, &normalized.id, &normalized, &session_indexes(&normalized))
}

pub fn update_session(
    db: &Database,
    session_id: &str,
    mutate: impl FnOnce(&mut SessionRecord),
) -> Result<Option<SessionRecord>, String> {
    let Some(mut session) = get_session(db, session_id)? else {
        return Ok(None);
    };
    mutate(&mut session);
    session.updated_at = current_timestamp_ms();
    let normalized = session.normalize();
    put_session(db, &normalized)?;
    Ok(Some(normalized))
}

pub fn touch_session(db: &Database, session_id: &str) -> Result<(), String> {
    let _ = update_session(db, session_id, |_session| {})?;
    Ok(())
}

pub fn get_message(db: &Database, message_id: &str) -> Result<Option<MessageRecord>, String> {
    db.get::<MessageRecord>(MESSAGES_STORE, message_id)
        .map(|value| value.map(MessageRecord::normalize))
}

pub fn put_message(
    db: &Database,
    message: &MessageRecord,
    touch_session_after_write: bool,
) -> Result<(), String> {
    let normalized = message.clone().normalize();
    db.put(
        MESSAGES_STORE,
        &normalized.id,
        &normalized,
        &message_indexes(&normalized),
    )?;
    if touch_session_after_write {
        touch_session(db, &normalized.session_id)?;
    }
    Ok(())
}

pub fn update_message(
    db: &Database,
    message_id: &str,
    touch_session_after_write: bool,
    mutate: impl FnOnce(&mut MessageRecord),
) -> Result<Option<MessageRecord>, String> {
    let Some(mut message) = get_message(db, message_id)? else {
        return Ok(None);
    };
    mutate(&mut message);
    let normalized = message.normalize();
    put_message(db, &normalized, touch_session_after_write)?;
    Ok(Some(normalized))
}

pub fn get_messages_by_session(
    db: &Database,
    session_id: &str,
) -> Result<Vec<MessageRecord>, String> {
    let mut messages = db.get_all_from_index::<MessageRecord>(
        MESSAGES_STORE,
        "by-sessionId",
        Some(session_id),
    )?;
    messages.sort_by_key(|message| message.created_at);
    Ok(messages
        .into_iter()
        .map(MessageRecord::normalize)
        .collect::<Vec<_>>())
}

pub fn delete_messages_after(
    db: &Database,
    session_id: &str,
    message_id: &str,
) -> Result<Vec<String>, String> {
    let messages = get_messages_by_session(db, session_id)?;
    let cutoff_index = messages
        .iter()
        .position(|message| message.id == message_id)
        .ok_or_else(|| format!("Message not found: {message_id}"))?;

    let to_delete = messages.into_iter().skip(cutoff_index + 1).collect::<Vec<_>>();
    if to_delete.is_empty() {
        return Ok(Vec::new());
    }

    for message in &to_delete {
        db.delete(MESSAGES_STORE, &message.id)?;
    }
    touch_session(db, session_id)?;
    Ok(to_delete.into_iter().map(|message| message.id).collect())
}

pub fn find_assistant_message_by_task_id(
    db: &Database,
    session_id: Option<&str>,
    task_id: &str,
) -> Result<Option<MessageRecord>, String> {
    let task_id = task_id.trim();
    if task_id.is_empty() {
        return Ok(None);
    }
    if let Some(session_id) = session_id.map(str::trim).filter(|value| !value.is_empty()) {
        let messages = get_messages_by_session(db, session_id)?;
        return Ok(messages.into_iter().find(|message| {
            message.role == "assistant" && message.task_id.as_deref() == Some(task_id)
        }));
    }
    let messages = db.get_all::<MessageRecord>(MESSAGES_STORE)?;
    Ok(messages
        .into_iter()
        .map(MessageRecord::normalize)
        .find(|message| message.role == "assistant" && message.task_id.as_deref() == Some(task_id)))
}

pub fn get_agent_todos_by_session(
    db: &Database,
    session_id: &str,
) -> Result<Vec<AgentTodoRecord>, String> {
    let mut todos = db.get_all_from_index::<AgentTodoRecord>(
        AGENT_TODOS_STORE,
        "by-sessionId",
        Some(session_id),
    )?;
    todos.sort_by_key(|todo| (todo.order, todo.created_at));
    Ok(todos.into_iter().map(AgentTodoRecord::normalize).collect())
}

pub fn put_agent_todo(db: &Database, todo: &AgentTodoRecord) -> Result<(), String> {
    let normalized = todo.clone().normalize();
    db.put(
        AGENT_TODOS_STORE,
        &normalized.id,
        &normalized,
        &todo_indexes(&normalized),
    )
}

pub fn replace_agent_todos(
    db: &Database,
    session_id: &str,
    todos: &[AgentTodoRecord],
) -> Result<(), String> {
    let existing = get_agent_todos_by_session(db, session_id)?;
    for todo in existing {
        db.delete(AGENT_TODOS_STORE, &todo.id)?;
    }
    for todo in todos {
        put_agent_todo(db, todo)?;
    }
    Ok(())
}

pub fn copy_active_agent_todos(
    db: &Database,
    source_session_id: &str,
    target_session_id: &str,
) -> Result<Vec<AgentTodoRecord>, String> {
    let source = get_agent_todos_by_session(db, source_session_id)?;
    let now = current_timestamp_ms();
    let copied = source
        .into_iter()
        .filter(|todo| normalize_todo_status(&todo.status) != "cancelled")
        .map(|todo| AgentTodoRecord {
            id: new_todo_id(),
            session_id: target_session_id.to_string(),
            content: todo.content,
            status: todo.status,
            order: todo.order,
            created_at: now,
            updated_at: now,
        })
        .collect::<Vec<_>>();
    replace_agent_todos(db, target_session_id, &copied)?;
    Ok(copied)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompactPersistResult {
    pub compact_message_id: String,
    /// Kept for API compatibility. Always empty — compact no longer deletes history.
    pub deleted_message_ids: Vec<String>,
    /// Conversation messages compacted out of the model context (not deleted).
    pub removed_count: usize,
    pub anchor_after_message_id: Option<String>,
    pub first_kept_message_id: Option<String>,
}

fn estimate_record_tokens(record: &MessageRecord) -> u32 {
    (record.content.len() as f64 / 2.0).ceil() as u32
}

fn select_tail_record_count(records: &[&MessageRecord], max_tokens: u32) -> usize {
    if max_tokens == 0 || records.is_empty() {
        return 0;
    }

    let mut selected = 0usize;
    let mut remaining = max_tokens;

    for record in records.iter().rev() {
        if remaining == 0 {
            break;
        }
        let tokens = estimate_record_tokens(record);
        if tokens <= remaining {
            selected += 1;
            remaining = remaining.saturating_sub(tokens);
        } else {
            break;
        }
    }

    selected
}

pub fn estimate_compact_anchor_after_message_id(records: &[MessageRecord]) -> Option<String> {
    let conversation: Vec<&MessageRecord> = records
        .iter()
        .filter(|record| record.message_kind.as_deref() != Some(super::records::MESSAGE_KIND_COMPACT))
        .collect();

    if conversation.len() < 2 {
        return conversation.last().map(|record| record.id.clone());
    }

    let keep_count = select_tail_record_count(&conversation, COMPACT_USER_MESSAGE_MAX_TOKENS);
    if keep_count == 0 || keep_count >= conversation.len() {
        return conversation.last().map(|record| record.id.clone());
    }

    let first_kept_index = conversation.len() - keep_count;
    if first_kept_index == 0 {
        return None;
    }

    Some(conversation[first_kept_index - 1].id.clone())
}

const COMPACT_USER_MESSAGE_MAX_TOKENS: u32 = 20_000;

/// Keep only the latest compact marker and subsequent messages.
/// Older conversation rows remain in the DB for the UI timeline.
pub fn truncate_history_at_latest_compact(
    records: Vec<crate::db::records::MessageRecord>,
) -> Vec<crate::db::records::MessageRecord> {
    let latest_compact_idx = records.iter().rposition(|message| {
        message.message_kind.as_deref() == Some(super::records::MESSAGE_KIND_COMPACT)
    });
    match latest_compact_idx {
        Some(index) => records.into_iter().skip(index).collect(),
        None => records,
    }
}

/// Persist a compaction boundary into the session message timeline.
///
/// Inserts a compact marker at the split point. Chat history is never deleted —
/// only the model prompt assembly truncates at the latest marker.
pub fn persist_session_compact(
    db: &Database,
    session_id: &str,
    summary_text: &str,
    max_tail_tokens: u32,
    summary_prefix: &str,
    force: bool,
) -> Result<CompactPersistResult, String> {
    let records = get_messages_by_session(db, session_id)?;
    let conversation: Vec<(usize, &MessageRecord)> = records
        .iter()
        .enumerate()
        .filter(|(_, record)| record.message_kind.as_deref() != Some(super::records::MESSAGE_KIND_COMPACT))
        .collect();

    if conversation.len() < 2 {
        return Err("Not enough messages to compact.".to_string());
    }

    let mut keep_count = select_tail_record_count(
        &conversation
            .iter()
            .map(|(_, record)| *record)
            .collect::<Vec<_>>(),
        max_tail_tokens,
    );

    if force && conversation.len() >= 2 && keep_count >= conversation.len() {
        keep_count = 1;
    }

    if keep_count == 0 || keep_count >= conversation.len() {
        return Ok(CompactPersistResult {
            compact_message_id: String::new(),
            deleted_message_ids: Vec::new(),
            removed_count: 0,
            anchor_after_message_id: None,
            first_kept_message_id: None,
        });
    }

    let split_conversation_idx = conversation.len() - keep_count;
    let first_kept_index = conversation[split_conversation_idx].0;
    let first_kept = records[first_kept_index].clone();
    if split_conversation_idx == 0 {
        return Ok(CompactPersistResult {
            compact_message_id: String::new(),
            deleted_message_ids: Vec::new(),
            removed_count: 0,
            anchor_after_message_id: None,
            first_kept_message_id: None,
        });
    }

    let anchor_after = conversation[split_conversation_idx - 1].1;
    let previous_ts = anchor_after.created_at;
    let next_ts = first_kept.created_at;
    let compact_created_at = if next_ts > previous_ts.saturating_add(1) {
        previous_ts + (next_ts - previous_ts) / 2
    } else {
        previous_ts
            .saturating_add(1)
            .min(next_ts.saturating_sub(1).max(previous_ts))
    };

    let compact_message = MessageRecord {
        id: new_message_id(),
        session_id: session_id.to_string(),
        role: "assistant".to_string(),
        message_kind: Some(super::records::MESSAGE_KIND_COMPACT.to_string()),
        content: format!(
            "{summary_prefix}## Context Compaction Summary\n\n{summary_text}"
        ),
        images: None,
        referenced_skills: None,
        thinking: String::new(),
        process_steps: None,
        tool_invocations: Vec::new(),
        status: "completed".to_string(),
        task_id: Some(first_kept.id.clone()),
        error: None,
        created_at: compact_created_at,
        duration_ms: None,
        usage: None,
    };

    put_message(db, &compact_message, true)?;

    Ok(CompactPersistResult {
        compact_message_id: compact_message.id,
        deleted_message_ids: Vec::new(),
        removed_count: split_conversation_idx,
        anchor_after_message_id: Some(anchor_after.id.clone()),
        first_kept_message_id: Some(first_kept.id),
    })
}

#[cfg(test)]
mod compact_persist_tests {
    use super::*;
    use crate::db::records::SessionRecord;
    use crate::db::Database;

    fn seed_session(db: &Database, session_id: &str) {
        let now = current_timestamp_ms();
        put_session(
            db,
            &SessionRecord {
                id: session_id.to_string(),
                title: "Test".to_string(),
                model: "gpt-4".to_string(),
                provider: "custom".to_string(),
                workspace_dir: None,
                session_kind: "standard".to_string(),
                autonomy_mode: "interactive".to_string(),
                decision_policy_version: "mvp-v1".to_string(),
                decision_model: None,
                parent_session_id: None,
                handoff_from_session_id: None,
                handoff_message_id: None,
                handoff_phase: None,
                plan_file_name: None,
                plan_built_at: None,
                context_usage_snapshot: None,
                pinned_at: None,
                created_at: now,
                updated_at: now,
            },
        )
        .expect("session");
    }

    fn seed_message(
        db: &Database,
        session_id: &str,
        role: &str,
        content: &str,
        created_at: u64,
    ) -> String {
        let message = MessageRecord {
            id: new_message_id(),
            session_id: session_id.to_string(),
            role: role.to_string(),
            message_kind: None,
            content: content.to_string(),
            images: None,
            referenced_skills: None,
            thinking: String::new(),
            process_steps: None,
            tool_invocations: Vec::new(),
            status: "completed".to_string(),
            task_id: None,
            error: None,
            created_at,
            duration_ms: None,
            usage: None,
        };
        put_message(db, &message, false).expect("message");
        message.id
    }

    #[test]
    fn persist_session_compact_keeps_history_and_inserts_marker() {
        let coder_dir = std::env::temp_dir().join(format!(
            "coder-compact-persist-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        std::fs::create_dir_all(&coder_dir).expect("temp dir");
        let db = Database::new(&coder_dir).expect("db");
        let session_id = "session-compact";
        seed_session(&db, session_id);
        seed_message(&db, session_id, "user", "first question", 100);
        let first_answer_id = seed_message(&db, session_id, "assistant", "first answer", 101);
        seed_message(&db, session_id, "user", "second question", 102);
        seed_message(&db, session_id, "assistant", "second answer", 103);

        let result = persist_session_compact(
            &db,
            session_id,
            "summary body",
            20,
            "prefix\n\n",
            false,
        )
        .expect("persist");

        assert_eq!(result.removed_count, 2);
        assert!(result.deleted_message_ids.is_empty());
        assert!(!result.compact_message_id.is_empty());
        assert_eq!(
            result.anchor_after_message_id.as_deref(),
            Some(first_answer_id.as_str())
        );

        let messages = get_messages_by_session(&db, session_id).expect("messages");
        assert_eq!(messages.len(), 5);
        assert_eq!(messages[0].content, "first question");
        assert_eq!(messages[1].content, "first answer");
        assert_eq!(messages[2].message_kind.as_deref(), Some("compact"));
        assert!(messages[2].content.contains("summary body"));
        assert_eq!(messages[3].content, "second question");
        assert_eq!(messages[4].content, "second answer");
        assert_eq!(
            messages[2].task_id.as_deref(),
            result.first_kept_message_id.as_deref()
        );
    }

    #[test]
    fn persist_session_compact_force_splits_even_when_tail_fits() {
        let coder_dir = std::env::temp_dir().join(format!(
            "coder-compact-force-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        std::fs::create_dir_all(&coder_dir).expect("temp dir");
        let db = Database::new(&coder_dir).expect("db");
        let session_id = "session-compact-force";
        seed_session(&db, session_id);
        seed_message(&db, session_id, "user", "short", 100);
        seed_message(&db, session_id, "assistant", "reply", 101);

        let result = persist_session_compact(
            &db,
            session_id,
            "forced summary",
            20_000,
            "prefix\n\n",
            true,
        )
        .expect("persist");

        assert_eq!(result.removed_count, 1);
        assert!(result.deleted_message_ids.is_empty());
        let messages = get_messages_by_session(&db, session_id).expect("messages");
        assert_eq!(messages.len(), 3);
        assert_eq!(messages[0].content, "short");
        assert_eq!(messages[1].message_kind.as_deref(), Some("compact"));
        assert_eq!(messages[2].content, "reply");
    }
}
