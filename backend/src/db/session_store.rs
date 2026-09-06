use uuid::Uuid;

use super::{
    records::{
        current_timestamp_ms, normalize_todo_status, AgentTodoRecord, MessageProcessStep,
        MessageRecord, SessionRecord, AGENT_TODOS_STORE, MESSAGE_KIND_COMPACT, MESSAGES_STORE,
        SESSIONS_STORE,
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
    let mut indexes = vec![IndexEntry {
        name: "by-updatedAt".to_string(),
        value: session.updated_at.to_string(),
    }];
    // SubAgent sessions carry parent_session_id; index them so sidebar
    // filtering and cascading cancel can look them up by parent.
    if let Some(ref parent) = session.parent_session_id {
        indexes.push(IndexEntry {
            name: "by-parentSessionId".to_string(),
            value: parent.clone(),
        });
    }
    indexes
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

/// List all sessions whose `parent_session_id` equals the given parent.
/// Used by cascading cancel (`cancel_session_and_children`) and could be
/// used by sidebar filtering if the backend ever serves the session list.
pub fn list_sessions_by_parent(
    db: &Database,
    parent_session_id: &str,
) -> Result<Vec<SessionRecord>, String> {
    let sessions = db.get_all_from_index::<SessionRecord>(
        SESSIONS_STORE,
        "by-parentSessionId",
        Some(parent_session_id),
    )?;
    Ok(sessions
        .into_iter()
        .map(SessionRecord::normalize)
        .collect::<Vec<_>>())
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

/// Returns the status of the most recent assistant message for a session.
///
/// Used to report a terminal status when the live run is no longer tracked in
/// the registry (e.g. the browser reconnected after the run finished), so the
/// frontend can reconcile `spawn_subagent` Labels without a live SSE replay.
pub fn latest_assistant_message_status(
    db: &Database,
    session_id: &str,
) -> Result<Option<String>, String> {
    let messages = get_messages_by_session(db, session_id)?;
    Ok(messages
        .iter()
        .filter(|m| m.role == "assistant")
        .last()
        .map(|m| m.status.clone()))
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
    /// Conversation messages moved out of the model context (not deleted).
    pub removed_count: usize,
    /// UI places the banner after this message.
    pub anchor_after_message_id: Option<String>,
}

/// 压缩保留窗口使用的字符预算（约等于旧 2 万 token 的字符量）。
///
/// 只用于选择“保留起点”，不参与上下文占用判断。
const LEGACY_COMPACT_TAIL_MAX_CHARS: usize = 40_000;

fn record_chars(record: &MessageRecord) -> usize {
    // 模型上下文组装会展开 tool_invocations / process_steps / thinking，
    // 这里同步计入，避免保留窗口低估真实体积。
    let content_len = record.content.len();
    let thinking_len = record.thinking.len();
    let tools_len: usize = record
        .tool_invocations
        .iter()
        .map(|invocation| {
            let input_len = serde_json::to_string(&invocation.input)
                .map(|value| value.len())
                .unwrap_or(2);
            let output_len = invocation
                .output
                .as_ref()
                .map(|value| {
                    serde_json::to_string(value)
                        .map(|serialized| serialized.len())
                        .unwrap_or(2)
                })
                .unwrap_or(0);
            let error_len = invocation.error_text.as_deref().map(str::len).unwrap_or(0);
            input_len.saturating_add(output_len).saturating_add(error_len)
        })
        .sum();
    let steps_len: usize = record
        .process_steps
        .as_ref()
        .map(|steps| {
            steps
                .iter()
                .map(|step| match step {
                    MessageProcessStep::Reasoning { text, .. } => text.len(),
                    MessageProcessStep::Answer { text, .. } => text.len(),
                    _ => 0,
                })
                .sum()
        })
        .unwrap_or(0);

    content_len
        .saturating_add(thinking_len)
        .saturating_add(tools_len)
        .saturating_add(steps_len)
}

fn select_tail_record_count(records: &[&MessageRecord], max_chars: usize) -> usize {
    if records.is_empty() {
        return 0;
    }

    let mut selected = 0usize;
    let mut remaining = max_chars;

    for record in records.iter().rev() {
        let chars = record_chars(record);
        if selected > 0 && chars > remaining {
            break;
        }
        selected += 1;
        remaining = remaining.saturating_sub(chars);
    }

    selected
}

// ---------------------------------------------------------------------------
// Compact persistence (handoff model)
// ---------------------------------------------------------------------------

/// 写入一条压缩 handoff（user 消息，kind=compact）。
///
/// Chat history is fully retained in the DB. The model only receives:
/// `latest compact handoff + all conversation messages after it`
/// (older handoffs are skipped by `model_history_from_latest_compact`).
///
/// A small usage baseline is stamped on the handoff so cross-run compact
/// decisions restart from "the new window is tiny" instead of inheriting the
/// pre-compact prompt size.
pub fn persist_session_compact(
    db: &Database,
    session_id: &str,
    summary_text: &str,
) -> Result<CompactPersistResult, String> {
    let records = get_messages_by_session(db, session_id)?;
    let conversation_count = records
        .iter()
        .filter(|record| record.message_kind.as_deref() != Some(MESSAGE_KIND_COMPACT))
        .count();

    if conversation_count < 2 {
        return Err("Not enough messages to compact.".to_string());
    }

    let event_after = records
        .iter()
        .rev()
        .find(|record| record.message_kind.as_deref() != Some(MESSAGE_KIND_COMPACT))
        .map(|record| record.id.clone());

    let baseline = crate::agent::compact::post_compact_usage_baseline();
    let compact_message = MessageRecord {
        id: new_message_id(),
        session_id: session_id.to_string(),
        role: "user".to_string(),
        message_kind: Some(MESSAGE_KIND_COMPACT.to_string()),
        content: summary_text.trim().to_string(),
        images: None,
        referenced_skills: None,
        thinking: String::new(),
        process_steps: None,
        tool_invocations: Vec::new(),
        status: "completed".to_string(),
        task_id: None,
        error: None,
        // UI event point: immediately after the latest conversation message.
        created_at: current_timestamp_ms(),
        duration_ms: None,
        usage: Some(baseline),
    };

    put_message(db, &compact_message, true)?;

    Ok(CompactPersistResult {
        compact_message_id: compact_message.id,
        removed_count: conversation_count,
        anchor_after_message_id: event_after,
    })
}

/// Build the model-visible history window from the latest compact handoff.
///
/// New-style windows are `latest handoff + everything after it`. Legacy
/// markers (assistant role carrying a first_kept cursor in `task_id`) keep
/// their old tail semantics so existing sessions stay readable.
pub fn model_history_from_latest_compact(
    records: Vec<crate::db::records::MessageRecord>,
) -> Vec<crate::db::records::MessageRecord> {
    let latest_compact_idx = records.iter().rposition(|message| {
        message.message_kind.as_deref() == Some(MESSAGE_KIND_COMPACT)
    });
    let Some(compact_idx) = latest_compact_idx else {
        return records;
    };

    let compact = &records[compact_idx];
    if compact.role != "user" {
        // Legacy marker: keep the old first_kept tail semantics.
        return legacy_model_history_from_latest_compact(records, compact_idx);
    }

    let mut result = Vec::with_capacity(records.len().saturating_sub(compact_idx));
    result.push(compact.clone());
    for message in records.into_iter().skip(compact_idx + 1) {
        // 新式 handoff 之间没有"保留尾巴"的概念：窗口就是最新 handoff，
        // 其后的真实对话消息会自然累积进来。旧 handoff 永远被跳过。
        result.push(message);
    }
    result
}

/// Legacy window: `latest legacy marker + conversation from first_kept onward`
/// (skipping any older compact markers). Used only for pre-redesign sessions.
fn legacy_model_history_from_latest_compact(
    records: Vec<crate::db::records::MessageRecord>,
    compact_idx: usize,
) -> Vec<crate::db::records::MessageRecord> {
    let first_kept_id = records[compact_idx].task_id.clone();
    let start_idx = first_kept_id
        .as_deref()
        .and_then(|id| {
            records.iter().position(|message| {
                message.id == id
                    && message.message_kind.as_deref()
                        != Some(MESSAGE_KIND_COMPACT)
            })
        })
        .unwrap_or_else(|| legacy_recover_first_kept_start_idx(&records, compact_idx));

    let mut result = Vec::with_capacity(records.len().saturating_sub(start_idx).saturating_add(1));
    result.push(records[compact_idx].clone());
    for message in records.into_iter().skip(start_idx) {
        if message.message_kind.as_deref() == Some(MESSAGE_KIND_COMPACT) {
            continue;
        }
        result.push(message);
    }
    result
}

/// Recover a first_kept index when a legacy marker's cursor is missing.
///
/// Uses the conversation that existed at compact time (created_at before the
/// marker) and selects a token-budget tail — never falls back to the marker
/// index itself, which would drop the entire kept window.
fn legacy_recover_first_kept_start_idx(
    records: &[crate::db::records::MessageRecord],
    compact_idx: usize,
) -> usize {
    let compact_created_at = records[compact_idx].created_at;
    let conversation: Vec<(usize, &MessageRecord)> = records
        .iter()
        .enumerate()
        .filter(|(index, record)| {
            *index < compact_idx
                && record.message_kind.as_deref() != Some(MESSAGE_KIND_COMPACT)
                && record.created_at <= compact_created_at
        })
        .map(|(index, record)| (index, record))
        .collect();

    if conversation.is_empty() {
        // No pre-compact conversation — start just after the marker slot.
        return compact_idx.saturating_add(1).min(records.len());
    }

    let mut keep_count = select_tail_record_count(
        &conversation
            .iter()
            .map(|(_, record)| *record)
            .collect::<Vec<_>>(),
        LEGACY_COMPACT_TAIL_MAX_CHARS,
    );
    if keep_count == 0 {
        keep_count = 1;
    }
    if keep_count > conversation.len() {
        keep_count = conversation.len();
    }

    conversation[conversation.len() - keep_count].0
}

/// @deprecated Prefer `model_history_from_latest_compact`.
pub fn truncate_history_at_latest_compact(
    records: Vec<crate::db::records::MessageRecord>,
) -> Vec<crate::db::records::MessageRecord> {
    model_history_from_latest_compact(records)
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
                plan_file_name: None,
                plan_built_at: None,
                context_usage_snapshot: None,
                pinned_at: None,
                attached_mcp_servers: None,
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
    fn persist_session_compact_keeps_history_and_inserts_user_handoff() {
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
        seed_message(&db, session_id, "assistant", "first answer", 101);
        seed_message(&db, session_id, "user", "second question", 102);
        let last_id = seed_message(&db, session_id, "assistant", "second answer", 103);

        let result = persist_session_compact(&db, session_id, "handoff body")
            .expect("persist");

        assert_eq!(result.removed_count, 4, "全部会话消息移出模型窗口");
        assert!(!result.compact_message_id.is_empty());
        assert_eq!(
            result.anchor_after_message_id.as_deref(),
            Some(last_id.as_str())
        );

        let messages = get_messages_by_session(&db, session_id).expect("messages");
        assert_eq!(messages.len(), 5);
        assert_eq!(messages[0].content, "first question");
        assert_eq!(messages[1].content, "first answer");
        assert_eq!(messages[2].content, "second question");
        assert_eq!(messages[3].content, "second answer");

        let handoff = &messages[4];
        assert_eq!(handoff.message_kind.as_deref(), Some("compact"));
        // Handoff 是 user 消息，内容不带任何前缀。
        assert_eq!(handoff.role, "user");
        assert_eq!(handoff.content, "handoff body");
        assert!(handoff.task_id.is_none());
        assert!(handoff.created_at > 103, "压缩记录使用真实当前时间");
        // 写入小 usage 基线，跨 run 的压缩判断从新窗口重新起算。
        let baseline = handoff.usage.as_ref().expect("usage baseline");
        assert!(baseline.prompt_tokens < 4_096);

        // 模型窗口 = handoff 本身（其后没有新消息）。
        let model = model_history_from_latest_compact(messages);
        assert_eq!(model.len(), 1);
        assert_eq!(model[0].id, result.compact_message_id);
    }

    #[test]
    fn persist_session_compact_requires_two_conversation_messages() {
        let coder_dir = std::env::temp_dir().join(format!(
            "coder-compact-minimum-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        std::fs::create_dir_all(&coder_dir).expect("temp dir");
        let db = Database::new(&coder_dir).expect("db");
        let session_id = "session-compact-min";
        seed_session(&db, session_id);
        seed_message(&db, session_id, "user", "only one", 100);

        assert!(persist_session_compact(&db, session_id, "handoff").is_err());
    }

    #[test]
    fn model_history_from_latest_compact_keeps_handoff_and_everything_after() {
        let records = vec![
            record("old", "user", None, None, 1),
            record("compact-1", "user", Some(MESSAGE_KIND_COMPACT.to_string()), None, 2),
            record("mid-user", "user", None, None, 3),
            record("mid-assistant", "assistant", None, None, 4),
        ];

        let model = model_history_from_latest_compact(records);
        assert_eq!(
            model.iter().map(|message| message.id.as_str()).collect::<Vec<_>>(),
            vec!["compact-1", "mid-user", "mid-assistant"]
        );
    }

    #[test]
    fn model_history_skips_older_handoffs() {
        let records = vec![
            record("old", "user", None, None, 1),
            record("compact-1", "user", Some(MESSAGE_KIND_COMPACT.to_string()), None, 2),
            record("mid-user", "user", None, None, 3),
            record("compact-2", "user", Some(MESSAGE_KIND_COMPACT.to_string()), None, 4),
            record("tail-assistant", "assistant", None, None, 5),
        ];

        let model = model_history_from_latest_compact(records);
        assert_eq!(
            model.iter().map(|message| message.id.as_str()).collect::<Vec<_>>(),
            vec!["compact-2", "tail-assistant"]
        );
    }

    #[test]
    fn legacy_marker_still_uses_first_kept_tail() {
        let records = vec![
            record("old", "user", None, None, 1),
            record("kept", "user", None, None, 2),
            record("tail", "assistant", None, None, 3),
            // 旧版 marker：assistant role + task_id 存 first_kept。
            record("compact", "assistant", Some(MESSAGE_KIND_COMPACT.to_string()), Some("kept".into()), 4),
        ];

        let model = model_history_from_latest_compact(records);
        assert_eq!(
            model.iter().map(|message| message.id.as_str()).collect::<Vec<_>>(),
            vec!["compact", "kept", "tail"]
        );
    }

    #[test]
    fn legacy_marker_recovers_tail_when_first_kept_missing() {
        let records = vec![
            record("old", "user", None, None, 1),
            record("kept", "user", None, None, 2),
            record("tail", "assistant", None, None, 3),
            record("compact", "assistant", Some(MESSAGE_KIND_COMPACT.to_string()), None, 4),
            record("after", "user", None, None, 5),
        ];

        let model = model_history_from_latest_compact(records);
        let ids: Vec<&str> = model.iter().map(|message| message.id.as_str()).collect();
        assert_eq!(ids[0], "compact");
        assert!(ids.contains(&"kept"));
        assert!(ids.contains(&"tail"));
        assert!(ids.contains(&"after"));
        // Must not collapse to summary-only (the old compact_idx fallback).
        assert!(ids.len() >= 3);
    }

    fn record(
        id: &str,
        role: &str,
        message_kind: Option<String>,
        task_id: Option<String>,
        created_at: u64,
    ) -> MessageRecord {
        MessageRecord {
            id: id.into(),
            session_id: "s".into(),
            role: role.into(),
            message_kind,
            content: format!("content of {id}"),
            images: None,
            referenced_skills: None,
            thinking: String::new(),
            process_steps: None,
            tool_invocations: Vec::new(),
            status: "completed".into(),
            task_id,
            error: None,
            created_at,
            duration_ms: None,
            usage: None,
        }
    }
}
