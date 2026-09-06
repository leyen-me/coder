//! 验证 handoff 模型下的压缩持久化：
//!
//! 1. 压缩写入一条 user 消息（kind=compact），全量历史保留。
//! 2. 模型窗口 = 最新 handoff + 其后的全部消息，旧 handoff 不再参与。
//! 3. handoff 携带小 usage 基线，跨 run 的压缩判断从新窗口重新起算。

use std::path::PathBuf;

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
    put_message(db, &message, false).expect("put message");
    message.id
}

#[test]
fn compact_persist_writes_user_handoff_and_drops_history_from_model_window() {
    let workspace = temp_dir("workspace");
    std::fs::create_dir_all(&workspace).expect("workspace");
    let data_dir = temp_dir("data");
    std::fs::create_dir_all(&data_dir).expect("data dir");
    let db = Database::new(&data_dir).expect("db");
    let session = sample_session(&workspace);
    put_session(&db, &session).expect("put session");

    // 旧 assistant 消息的 content 很短，但工具输出非常大（模拟读文件 / shell 输出）。
    let old_assistant_id = new_message_id();
    let huge_output = "x".repeat(200_000);
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

    let latest_user_id = seed_message(&db, &session.id, "user", "continue", 200);

    let persisted = persist_session_compact(&db, &session.id, "# Handoff\n\nprogress...")
        .expect("persist compact");

    assert_eq!(
        persisted.removed_count, 2,
        "全部会话消息移出模型窗口（不再保留尾巴）"
    );
    assert_eq!(
        persisted.anchor_after_message_id.as_deref(),
        Some(latest_user_id.as_str())
    );

    let records = get_messages_by_session(&db, &session.id).expect("messages");
    // 全量历史仍在 DB。
    assert_eq!(records.len(), 3);
    assert!(records.iter().any(|record| record.id == old_assistant_id));

    // handoff 是 user 消息，不带前缀。
    let handoff = records
        .iter()
        .find(|record| record.id == persisted.compact_message_id)
        .expect("handoff record");
    assert_eq!(handoff.role, "user");
    assert_eq!(handoff.content, "# Handoff\n\nprogress...");

    // 模型窗口 = handoff，巨大工具输出不再进入。
    let model = model_history_from_latest_compact(records);
    assert_eq!(model.len(), 1);
    assert_eq!(model[0].id, persisted.compact_message_id);
}

#[test]
fn model_window_is_handoff_plus_following_conversation() {
    let workspace = temp_dir("workspace-window");
    std::fs::create_dir_all(&workspace).expect("workspace");
    let data_dir = temp_dir("data-window");
    std::fs::create_dir_all(&data_dir).expect("data dir");
    let db = Database::new(&data_dir).expect("db");
    let session = sample_session(&workspace);
    put_session(&db, &session).expect("put session");

    seed_message(&db, &session.id, "user", "first question", 100);
    seed_message(&db, &session.id, "assistant", "first answer", 110);

    let persisted = persist_session_compact(&db, &session.id, "# Handoff")
        .expect("persist compact");

    // handoff 之后继续对话。handoff 的 created_at 是真实当前时间戳（毫秒级），
    // 后续消息必须在其后，否则会被排序到 handoff 之前而被移出窗口。
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("clock")
        .as_millis() as u64;
    seed_message(&db, &session.id, "user", "second question", now + 1);
    seed_message(&db, &session.id, "assistant", "second answer", now + 2);

    let records = get_messages_by_session(&db, &session.id).expect("messages");
    // 模型窗口 = handoff + 其后的两条消息；handoff 之前的历史被移出。
    let model = model_history_from_latest_compact(records);
    let ids: Vec<&str> = model.iter().map(|record| record.id.as_str()).collect();
    assert_eq!(ids[0], persisted.compact_message_id, "窗口以 handoff 开头");
    assert_eq!(model.len(), 3, "handoff + 两条后续消息");
}

#[test]
fn consecutive_handoffs_keep_only_latest_in_model_window() {
    let workspace = temp_dir("workspace-twice");
    std::fs::create_dir_all(&workspace).expect("workspace");
    let data_dir = temp_dir("data-twice");
    std::fs::create_dir_all(&data_dir).expect("data dir");
    let db = Database::new(&data_dir).expect("db");
    let session = sample_session(&workspace);
    put_session(&db, &session).expect("put session");

    seed_message(&db, &session.id, "user", "first question", 100);
    seed_message(&db, &session.id, "assistant", "first answer", 110);

    let first = persist_session_compact(&db, &session.id, "# Handoff 1")
        .expect("first compact");

    // handoff 之后继续对话，然后再次压缩。
    seed_message(&db, &session.id, "user", "second question", 200);
    seed_message(&db, &session.id, "assistant", "second answer", 210);

    let second = persist_session_compact(&db, &session.id, "# Handoff 2")
        .expect("second compact");

    let records = get_messages_by_session(&db, &session.id).expect("messages");
    let handoffs: Vec<&MessageRecord> = records
        .iter()
        .filter(|record| record.message_kind.as_deref() == Some("compact"))
        .collect();
    assert_eq!(handoffs.len(), 2, "两次压缩各留一条 handoff");

    // 模型窗口以最新 handoff 开头；旧 handoff 被跳过。
    let model = model_history_from_latest_compact(records);
    let ids: Vec<&str> = model.iter().map(|record| record.id.as_str()).collect();
    assert_eq!(ids[0], second.compact_message_id, "窗口以最新 handoff 开头");
    assert!(!ids.iter().any(|id| *id == first.compact_message_id.as_str()), "旧 handoff 被跳过");
}

#[test]
fn handoff_carries_small_usage_baseline() {
    let workspace = temp_dir("workspace-baseline");
    std::fs::create_dir_all(&workspace).expect("workspace");
    let data_dir = temp_dir("data-baseline");
    std::fs::create_dir_all(&data_dir).expect("data dir");
    let db = Database::new(&data_dir).expect("db");
    let session = sample_session(&workspace);
    put_session(&db, &session).expect("put session");

    seed_message(&db, &session.id, "user", "q", 100);
    seed_message(&db, &session.id, "assistant", "a", 110);

    let persisted = persist_session_compact(&db, &session.id, "# Handoff")
        .expect("persist compact");

    let records = get_messages_by_session(&db, &session.id).expect("messages");
    let handoff = records
        .iter()
        .find(|record| record.id == persisted.compact_message_id)
        .expect("handoff record");
    let baseline = handoff.usage.as_ref().expect("usage baseline");
    assert!(baseline.prompt_tokens > 0);
    // 必须远低于任何真实触发阈值，避免新 run 第一轮误触发。
    assert!(!coder_lib::agent::compact::should_trigger_compact(
        baseline.prompt_tokens,
        96_000,
        None
    ));
}
