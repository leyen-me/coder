//! 验证重构后的压缩行为：
//!
//! 1. 自动压缩只由真实 usage 触发，达到 80% 才触发，没有真实 usage 不压缩。
//! 2. 只要执行压缩，数据库一定写入压缩记录，不允许“内存压缩但 DB 没记录”。
//! 3. 生产库中的真实 usage 远低于 80% 时不会触发自动压缩。

use std::path::PathBuf;

use coder_lib::agent::compact::{should_trigger_compact, COMPACT_TAIL_MAX_CHARS};
use coder_lib::db::records::{
    current_timestamp_ms, MessageProcessStep, MessageRecord, SessionRecord,
};
use coder_lib::db::session_store::{
    get_messages_by_session, model_history_from_latest_compact, new_message_id, new_session_id,
    persist_session_compact, put_message, put_session, repair_missing_compact_markers,
};
use coder_lib::db::Database;

const PROD_MAX_TOKENS: u32 = 1_000_000;
const THRESHOLD: f64 = 0.8;

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
    std::fs::create_dir_all(&dir).expect("prod copy dir");
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

fn seed_assistant_with_compact_step(
    db: &Database,
    session_id: &str,
    content: &str,
    created_at: u64,
) -> String {
    let message = MessageRecord {
        id: new_message_id(),
        session_id: session_id.to_string(),
        role: "assistant".to_string(),
        message_kind: None,
        content: content.to_string(),
        images: None,
        referenced_skills: None,
        thinking: String::new(),
        process_steps: Some(vec![MessageProcessStep::Compact {
            id: "compact:auto".to_string(),
            state: "completed".to_string(),
            removed_count: 1,
            preview: "## Context Summary\n\n旧内容摘要".to_string(),
            compact_message_id: None,
        }]),
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
    // 79.9% 不触发，80% 触发。
    assert!(!should_trigger_compact(7_999, 10_000, Some(THRESHOLD)));
    assert!(should_trigger_compact(8_000, 10_000, Some(THRESHOLD)));
    // 没有真实 usage（0）时不触发。
    assert!(!should_trigger_compact(0, PROD_MAX_TOKENS, Some(THRESHOLD)));
}

#[test]
fn persist_always_writes_compact_record_when_tail_fits() {
    let workspace = temp_dir("workspace-tiny");
    std::fs::create_dir_all(&workspace).expect("workspace");
    let data_dir = temp_dir("data-tiny");
    std::fs::create_dir_all(&data_dir).expect("data dir");
    let db = Database::new(&data_dir).expect("db");
    let session = sample_session(&workspace);
    put_session(&db, &session).expect("put session");

    let first_id = seed_message(&db, &session.id, "user", "first", 100);
    seed_message(&db, &session.id, "assistant", "last", 200);

    let persisted = persist_session_compact(
        &db,
        &session.id,
        "Concise summary.",
        COMPACT_TAIL_MAX_CHARS,
        "## Context Compaction Summary\n\n",
    )
    .expect("persist compact");

    assert!(
        !persisted.compact_message_id.is_empty(),
        "只要执行压缩就必须写压缩记录"
    );
    assert_eq!(persisted.removed_count, 0, "预算能放下时全部保留");
    assert_eq!(
        persisted.first_kept_message_id.as_deref(),
        Some(first_id.as_str())
    );

    let messages = get_messages_by_session(&db, &session.id).expect("messages");
    let model = model_history_from_latest_compact(messages);
    assert!(
        model.iter().any(|record| record.message_kind.as_deref() == Some("compact")),
        "SQLite 中必须存在压缩记录"
    );
    assert_eq!(model.len(), 3, "模型窗口 = 压缩记录 + 全部保留消息");
}

#[test]
fn stale_db_snapshot_no_longer_noops() {
    let workspace = temp_dir("workspace-stale");
    std::fs::create_dir_all(&workspace).expect("workspace");
    let data_dir = temp_dir("data-stale");
    std::fs::create_dir_all(&data_dir).expect("data dir");
    let db = Database::new(&data_dir).expect("db");
    let session = sample_session(&workspace);
    put_session(&db, &session).expect("put session");

    // 两条小消息：旧逻辑会认为“全部 fit 在保留窗口”并 noop，
    // 新逻辑强制写入压缩记录。
    seed_message(&db, &session.id, "user", "old", 100);
    seed_message(&db, &session.id, "assistant", "ok", 200);

    let persisted = persist_session_compact(
        &db,
        &session.id,
        "Concise summary.",
        COMPACT_TAIL_MAX_CHARS,
        "## Context Compaction Summary\n\n",
    )
    .expect("persist compact");

    assert!(
        !persisted.compact_message_id.is_empty(),
        "DB 快照小也不允许 noop，必须写压缩记录"
    );
    assert_eq!(persisted.removed_count, 0, "预算能放下时全部保留");
}

#[test]
fn repair_adds_missing_compact_record_only_once() {
    let workspace = temp_dir("workspace-repair");
    std::fs::create_dir_all(&workspace).expect("workspace");
    let data_dir = temp_dir("data-repair");
    std::fs::create_dir_all(&data_dir).expect("data dir");
    let db = Database::new(&data_dir).expect("db");

    let broken_session = sample_session(&workspace);
    put_session(&db, &broken_session).expect("put session");
    seed_message(&db, &broken_session.id, "user", "question", 100);
    seed_assistant_with_compact_step(&db, &broken_session.id, "answer", 200);

    let repaired = repair_missing_compact_markers(&db).expect("repair");
    assert_eq!(repaired, 1);

    let messages = get_messages_by_session(&db, &broken_session.id).expect("messages");
    assert!(
        messages
            .iter()
            .any(|record| record.message_kind.as_deref() == Some("compact")),
        "修复后应存在压缩记录"
    );

    // 第二次修复不应重复补写。
    let repaired_again = repair_missing_compact_markers(&db).expect("repair again");
    assert_eq!(repaired_again, 0);
}

#[test]
fn consecutive_manual_compacts_keep_latest_window_and_distinct_timestamps() {
    let workspace = temp_dir("workspace-twice");
    std::fs::create_dir_all(&workspace).expect("workspace");
    let data_dir = temp_dir("data-twice");
    std::fs::create_dir_all(&data_dir).expect("data dir");
    let db = Database::new(&data_dir).expect("db");
    let session = sample_session(&workspace);
    put_session(&db, &session).expect("put session");

    let first = seed_message(&db, &session.id, "user", "first question", 100);
    seed_message(&db, &session.id, "assistant", "first answer", 110);
    seed_message(&db, &session.id, "user", "second question", 120);
    let last = seed_message(&db, &session.id, "assistant", "second answer", 130);

    let first_compact = persist_session_compact(
        &db,
        &session.id,
        "First summary.",
        COMPACT_TAIL_MAX_CHARS,
        "## Context Compaction Summary\n\n",
    )
    .expect("first compact");
    let second_compact = persist_session_compact(
        &db,
        &session.id,
        "Second summary.",
        COMPACT_TAIL_MAX_CHARS,
        "## Context Compaction Summary\n\n",
    )
    .expect("second compact");

    let messages = get_messages_by_session(&db, &session.id).expect("messages");
    let compact_records: Vec<&MessageRecord> = messages
        .iter()
        .filter(|record| record.message_kind.as_deref() == Some("compact"))
        .collect();
    assert_eq!(compact_records.len(), 2, "两次手动压缩应留下两条压缩记录");

    // 第二次压缩的窗口起点不应早于第一次：旧历史已经被第一次摘要覆盖。
    assert!(
        second_compact
            .first_kept_message_id
            .as_deref()
            .map(|id| id == first.as_str() || id == last.as_str())
            .unwrap_or(false),
        "第二次压缩应基于第一次压缩后的窗口，而不是重新包含全部历史"
    );

    // 两次压缩记录的时间必须不同，否则前端边界定位会互相覆盖。
    let first_created = messages
        .iter()
        .find(|record| record.id == first_compact.compact_message_id)
        .expect("first compact record")
        .created_at;
    let second_created = messages
        .iter()
        .find(|record| record.id == second_compact.compact_message_id)
        .expect("second compact record")
        .created_at;
    assert!(
        second_created > first_created,
        "第二次压缩记录时间必须晚于第一次"
    );

    // 模型窗口 = 最新摘要 + 当前窗口尾部，旧压缩记录不再参与。
    let model = model_history_from_latest_compact(messages);
    assert!(
        model
            .iter()
            .filter(|record| record.message_kind.as_deref() == Some("compact"))
            .count()
            == 1,
        "模型窗口只应包含最新一条压缩记录"
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
