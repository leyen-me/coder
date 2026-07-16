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
