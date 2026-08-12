//! 验证压缩持久化始终写入压缩记录：
//! 即使保留窗口使用字符预算，工具输出巨大的消息也会被移出模型窗口。

use std::path::PathBuf;

use coder_lib::agent::compact::COMPACT_TAIL_MAX_CHARS;
use coder_lib::db::records::{
    current_timestamp_ms, MessageRecord, MessageToolInvocation, SessionRecord,
};
use coder_lib::db::session_store::{
    get_messages_by_session, model_history_from_latest_compact, new_message_id, new_session_id,
    persist_session_compact, put_message, put_session,
};
use coder_lib::db::Database;
use serde_json::json;

fn temp_dir(label: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "coder-compact-persist-{label}-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    ))
}

fn sample_session(workspace: &PathBuf) -> SessionRecord {
    SessionRecord {
        id: new_session_id(),
        title: "Persist Window Repro".to_string(),
        model: "gpt-test".to_string(),
        provider: "custom".to_string(),
        workspace_dir: Some(workspace.to_string_lossy().to_string()),
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
        created_at: current_timestamp_ms(),
        updated_at: current_timestamp_ms(),
    }
}

#[test]
fn compact_persist_must_account_for_tool_output() {
    let workspace = temp_dir("workspace");
    std::fs::create_dir_all(&workspace).expect("workspace");
    let data_dir = temp_dir("data");
    std::fs::create_dir_all(&data_dir).expect("data dir");
    let db = Database::new(&data_dir).expect("db");
    let session = sample_session(&workspace);
    put_session(&db, &session).expect("put session");

    let old_assistant_id = new_message_id();
    // 旧 assistant 消息的 content 很短，但工具输出非常大（模拟读文件 / shell 输出）。
    let huge_output = "x".repeat(200_000); // 后端估算约 100k tokens
    put_message(
        &db,
        &MessageRecord {
            id: old_assistant_id.clone(),
            session_id: session.id.clone(),
            role: "assistant".to_string(),
            message_kind: None,
            content: "ok".to_string(),
            images: None,
            referenced_skills: None,
            thinking: String::new(),
            process_steps: None,
            tool_invocations: vec![MessageToolInvocation {
                id: "tool-1".to_string(),
                name: "read_file".to_string(),
                input: json!({"path": "src/main.rs"}),
                output: Some(json!({"content": huge_output})),
                error_text: None,
                state: "completed".to_string(),
            }],
            status: "completed".to_string(),
            task_id: None,
            error: None,
            created_at: 100,
            duration_ms: None,
            usage: None,
        },
        true,
    )
    .expect("put assistant");

    // 最新的 user 消息很短，压缩后模型窗口应从这里开始。
    let latest_user_id = new_message_id();
    put_message(
        &db,
        &MessageRecord {
            id: latest_user_id.clone(),
            session_id: session.id.clone(),
            role: "user".to_string(),
            message_kind: None,
            content: "continue".to_string(),
            images: None,
            referenced_skills: None,
            thinking: String::new(),
            process_steps: None,
            tool_invocations: Vec::new(),
            status: "completed".to_string(),
            task_id: None,
            error: None,
            created_at: 200,
            duration_ms: None,
            usage: None,
        },
        true,
    )
    .expect("put user");

    let persisted = persist_session_compact(
        &db,
        &session.id,
        "Concise summary.",
        COMPACT_TAIL_MAX_CHARS,
        "## Context Compaction Summary\n\n",
    )
    .expect("persist compact");

    assert!(
        persisted.removed_count > 0,
        "必须把巨大的工具输出消息压缩出模型窗口"
    );
    assert_eq!(
        persisted.first_kept_message_id.as_deref(),
        Some(latest_user_id.as_str()),
        "压缩后 first_kept 应指向最新 user 消息"
    );

    // marker 建立后，模型可见窗口只包含 summary + 最新 user 消息。
    let records = get_messages_by_session(&db, &session.id).expect("messages");
    let model = model_history_from_latest_compact(records);
    assert!(
        model.iter().any(|record| record.message_kind.as_deref() == Some("compact")),
        "SQLite 中必须存在 compact marker"
    );
    assert!(
        !model.iter().any(|record| record.id == old_assistant_id),
        "巨大的工具输出消息不应再进入模型窗口"
    );
}

#[test]
fn compact_persist_falls_back_to_one_message_when_latest_exceeds_budget() {
    let workspace = temp_dir("workspace-latest-large");
    std::fs::create_dir_all(&workspace).expect("workspace");
    let data_dir = temp_dir("data-latest-large");
    std::fs::create_dir_all(&data_dir).expect("data dir");
    let db = Database::new(&data_dir).expect("db");
    let session = sample_session(&workspace);
    put_session(&db, &session).expect("put session");

    put_message(
        &db,
        &MessageRecord {
            id: new_message_id(),
            session_id: session.id.clone(),
            role: "user".to_string(),
            message_kind: None,
            content: "old".to_string(),
            images: None,
            referenced_skills: None,
            thinking: String::new(),
            process_steps: None,
            tool_invocations: Vec::new(),
            status: "completed".to_string(),
            task_id: None,
            error: None,
            created_at: 100,
            duration_ms: None,
            usage: None,
        },
        true,
    )
    .expect("put old user");

    // 最新消息本身就超过字符预算，选择器也会至少保留它一条。
    let latest_user_id = new_message_id();
    put_message(
        &db,
        &MessageRecord {
            id: latest_user_id.clone(),
            session_id: session.id.clone(),
            role: "user".to_string(),
            message_kind: None,
            content: "x".repeat(200_000),
            images: None,
            referenced_skills: None,
            thinking: String::new(),
            process_steps: None,
            tool_invocations: Vec::new(),
            status: "completed".to_string(),
            task_id: None,
            error: None,
            created_at: 200,
            duration_ms: None,
            usage: None,
        },
        true,
    )
    .expect("put latest user");

    let persisted = persist_session_compact(
        &db,
        &session.id,
        "Concise summary.",
        COMPACT_TAIL_MAX_CHARS,
        "## Context Compaction Summary\n\n",
    )
    .expect("persist compact");

    assert!(
        persisted.removed_count > 0,
        "最新消息超预算时也应建立压缩记录"
    );
    assert_eq!(
        persisted.first_kept_message_id.as_deref(),
        Some(latest_user_id.as_str())
    );

    let records = get_messages_by_session(&db, &session.id).expect("messages");
    assert!(
        records
            .iter()
            .any(|record| record.message_kind.as_deref() == Some("compact")),
        "SQLite 中必须存在 compact marker"
    );
}
