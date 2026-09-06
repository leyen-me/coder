//! 验证 handoff 模型下的压缩行为：
//!
//! 1. 自动压缩只由真实 usage 触发，达到阈值才触发，没有真实 usage 不压缩。
//! 2. 只要执行压缩，数据库一定写入 handoff（user, kind=compact），
//!    不允许“内存压缩但 DB 没记录”。
//! 3. 生产库中的真实 usage 远低于阈值时不会触发自动压缩。

use std::path::PathBuf;

use coder_lib::agent::compact::should_trigger_compact;
use coder_lib::db::records::{current_timestamp_ms, MessageRecord, SessionRecord};
use coder_lib::db::session_store::{
    get_messages_by_session, model_history_from_latest_compact, new_message_id, new_session_id,
    persist_session_compact, put_message, put_session,
};
use coder_lib::db::Database;

const PROD_MAX_TOKENS: u32 = 1_000_000;
const THRESHOLD: f64 = 0.75;

fn temp_dir(label: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "coder-compact-chain-{label}-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    ))
}

/// 从 `CODER_TEST_PROD_DB` 指向的 SQLite 文件复制一份临时库，
/// 未设置环境变量时跳过。
fn open_prod_db_from_env() -> Option<Database> {
    let path = std::env::var("CODER_TEST_PROD_DB").ok()?;
    let dir = temp_dir("prod-copy");
    std::fs::create_dir_all(&dir)
        .unwrap_or_else(|error| panic!("create prod copy dir: {error}"));
    let dest = dir.join("coder.db");
    std::fs::copy(&path, &dest)
        .unwrap_or_else(|error| panic!("copy prod db {path}: {error}"));
    Some(Database::new(&dir).expect("open prod db copy"))
}

fn sample_session(workspace: &PathBuf) -> SessionRecord {
    SessionRecord {
        id: new_session_id(),
        title: "Compact Marker Chain Repro".to_string(),
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
fn threshold_boundaries_use_real_usage_only() {
    // 74.9% 不触发，75% 触发。
    assert!(!should_trigger_compact(7_499, 10_000, Some(THRESHOLD)));
    assert!(should_trigger_compact(7_500, 10_000, Some(THRESHOLD)));
    // 没有真实 usage（0）时不触发。
    assert!(!should_trigger_compact(0, PROD_MAX_TOKENS, Some(THRESHOLD)));
}

#[test]
fn persist_always_writes_handoff_record() {
    let workspace = temp_dir("workspace-tiny");
    std::fs::create_dir_all(&workspace).expect("workspace");
    let data_dir = temp_dir("data-tiny");
    std::fs::create_dir_all(&data_dir).expect("data dir");
    let db = Database::new(&data_dir).expect("db");
    let session = sample_session(&workspace);
    put_session(&db, &session).expect("put session");

    seed_message(&db, &session.id, "user", "first", 100);
    seed_message(&db, &session.id, "assistant", "last", 200);

    let persisted = persist_session_compact(&db, &session.id, "# Handoff")
        .expect("persist compact");

    assert!(
        !persisted.compact_message_id.is_empty(),
        "只要执行压缩就必须写 handoff"
    );
    assert_eq!(
        persisted.removed_count, 2,
        "handoff 模型下全部会话消息移出窗口"
    );

    let messages = get_messages_by_session(&db, &session.id).expect("messages");
    // 全量保留，只追加 handoff。
    assert_eq!(messages.len(), 3);
    assert!(
        messages
            .iter()
            .any(|record| record.message_kind.as_deref() == Some("compact")),
        "SQLite 中必须存在 handoff"
    );

    // 模型窗口 = handoff 本身。
    let model = model_history_from_latest_compact(messages);
    assert_eq!(model.len(), 1);
    assert_eq!(model[0].id, persisted.compact_message_id);
}

#[test]
fn persist_requires_two_conversation_messages() {
    let workspace = temp_dir("workspace-min");
    std::fs::create_dir_all(&workspace).expect("workspace");
    let data_dir = temp_dir("data-min");
    std::fs::create_dir_all(&data_dir).expect("data dir");
    let db = Database::new(&data_dir).expect("db");
    let session = sample_session(&workspace);
    put_session(&db, &session).expect("put session");

    seed_message(&db, &session.id, "user", "only one", 100);

    assert!(
        persist_session_compact(&db, &session.id, "# Handoff").is_err(),
        "不足两条会话消息时不允许压缩"
    );
}

#[test]
fn production_db_real_usage_never_triggers_at_1m_window() {
    let Some(db) = open_prod_db_from_env() else {
        eprintln!("SKIP: 未设置 CODER_TEST_PROD_DB");
        return;
    };

    let session_id = "d56727a4-4500-4451-91f1-1fb7b002129a";
    let messages = get_messages_by_session(&db, session_id).expect("production messages");

    let prompt_tokens: Vec<u32> = messages
        .iter()
        .filter_map(|record| {
            if record.role != "assistant" {
                return None;
            }
            record
                .usage
                .as_ref()
                .map(|usage| usage.prompt_tokens)
                .filter(|tokens| *tokens > 0)
        })
        .collect();
    assert!(!prompt_tokens.is_empty(), "生产 session 应存在 provider usage");

    let latest = *prompt_tokens.last().expect("latest usage");
    let peak = *prompt_tokens.iter().max().expect("peak usage");
    assert!(
        !should_trigger_compact(latest, PROD_MAX_TOKENS, Some(THRESHOLD)),
        "最新真实 usage {latest} 不应触发 1M 窗口的自动压缩"
    );
    assert!(
        !should_trigger_compact(peak, PROD_MAX_TOKENS, Some(THRESHOLD)),
        "峰值真实 usage {peak} 不应触发 1M 窗口的自动压缩"
    );
}
