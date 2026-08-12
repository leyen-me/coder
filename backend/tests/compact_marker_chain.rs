//! 验证生产数据中出现的两条压缩链路：
//!
//! 1. 若 SQLite 没有 compact marker，下一次 run 会重新组装全量历史，
//!    上下文估算立即超过 80% 阈值，导致用户刚发完消息就开始压缩。
//! 2. `persist_session_compact` 完全依赖压缩瞬间的 SQLite 快照来估算
//!    “保留窗口”；如果工具输出尚未落库（DB 快照滞后），它会静默返回
//!    noop，形成“内存已压缩、SQLite 无 marker”的不一致状态。

use std::path::PathBuf;

use coder_lib::agent::compact::{
    estimate_prompt_usage, should_trigger_compact, COMPACT_USER_MESSAGE_MAX_TOKENS,
};
use coder_lib::db::records::{
    current_timestamp_ms, MessageProcessStep, MessageRecord, MessageToolInvocation, SessionRecord,
};
use coder_lib::db::session_store::{
    get_messages_by_session, model_history_from_latest_compact, new_message_id, new_session_id,
    persist_session_compact, put_message, put_session, update_message,
};
use coder_lib::db::Database;
use coder_lib::agent::ChatMessage;
use serde_json::json;

const MAX_TOKENS: u32 = 96_000;
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
/// 用于把测试直接跑在生产数据上；未设置环境变量时跳过。
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

fn put_record(db: &Database, record: MessageRecord) {
    put_message(db, &record, false).expect("put message");
}

fn user_record(session_id: &str, content: &str, created_at: u64) -> MessageRecord {
    MessageRecord {
        id: new_message_id(),
        session_id: session_id.to_string(),
        role: "user".to_string(),
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
    }
}

fn assistant_record(session_id: &str, content: &str, created_at: u64) -> MessageRecord {
    MessageRecord {
        id: new_message_id(),
        session_id: session_id.to_string(),
        role: "assistant".to_string(),
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
    }
}

/// 与后端 `estimate_record_tokens` 同口径的粗略估算：content + thinking +
/// 工具输入/输出，按 2 字符 1 token 折算。
fn record_tokens_approx(record: &MessageRecord) -> u32 {
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
    let total = record
        .content
        .len()
        .saturating_add(record.thinking.len())
        .saturating_add(tools_len);
    (total as f64 / 2.0).ceil() as u32
}

fn total_tokens(records: &[MessageRecord]) -> u32 {
    records.iter().map(record_tokens_approx).sum()
}

fn first_step_is_compact(record: &MessageRecord) -> bool {
    matches!(
        record.process_steps.as_deref().and_then(|steps| steps.first()),
        Some(MessageProcessStep::Compact { .. })
    )
}

/// 没有 compact marker 时，`model_history_from_latest_compact` 返回全量历史；
/// 组装后的上下文估算立即超过 80%，所以用户下一条消息会触发第一轮压缩。
#[test]
fn no_marker_rebuilds_full_history_and_triggers_compact_immediately() {
    let workspace = temp_dir("workspace-full-history");
    std::fs::create_dir_all(&workspace).expect("workspace");
    let data_dir = temp_dir("data-full-history");
    std::fs::create_dir_all(&data_dir).expect("data dir");
    let db = Database::new(&data_dir).expect("db");
    let session = sample_session(&workspace);
    put_session(&db, &session).expect("put session");

    let huge_output = "x".repeat(200_000); // 约 100k token，远超 80% * 96k
    let old_user = user_record(&session.id, "第一轮用户消息", 100);
    let mut big_assistant = assistant_record(&session.id, "ok", 200);
    big_assistant.tool_invocations = vec![MessageToolInvocation {
        id: "tool-1".to_string(),
        name: "read_file".to_string(),
        input: json!({"path": "src/main.rs"}),
        output: Some(json!({"content": huge_output})),
        error_text: None,
        state: "completed".to_string(),
    }];
    let latest_user = user_record(&session.id, "继续，最新消息", 300);

    for record in [&old_user, &big_assistant, &latest_user] {
        put_record(&db, record.clone());
    }

    // 无 marker：模型历史窗口退化为全量，和 agent 在 DB 中找不到 marker 时一致。
    let mut records = get_messages_by_session(&db, &session.id).expect("messages");
    records.sort_by_key(|record| record.created_at);
    let no_marker_history = model_history_from_latest_compact(records.clone());
    assert_eq!(
        no_marker_history.len(),
        3,
        "缺少 compact marker 时不应裁剪历史"
    );

    let used = total_tokens(&no_marker_history);
    assert!(
        should_trigger_compact(used, MAX_TOKENS, Some(THRESHOLD)),
        "全量历史估算 {used} 应超过 80% 阈值并立即触发压缩"
    );

    // 对照组：正确写入 marker 后，模型窗口只剩 summary + 最新消息，
    // 新 run 不会因为历史重建而再次立即压缩。
    let compact = coder_lib::db::records::MessageRecord {
        id: new_message_id(),
        session_id: session.id.clone(),
        role: "assistant".to_string(),
        message_kind: Some("compact".to_string()),
        content: "## Context Compaction Summary\n\n旧历史已摘要".to_string(),
        images: None,
        referenced_skills: None,
        thinking: String::new(),
        process_steps: None,
        tool_invocations: Vec::new(),
        status: "completed".to_string(),
        task_id: Some(latest_user.id.clone()),
        error: None,
        created_at: 301,
        duration_ms: None,
        usage: None,
    };
    put_record(&db, compact);

    let mut with_marker = get_messages_by_session(&db, &session.id).expect("messages");
    with_marker.sort_by_key(|record| record.created_at);
    let marker_history = model_history_from_latest_compact(with_marker);
    assert_eq!(marker_history.len(), 2, "marker 后应只保留 summary + tail");
    let used_after = total_tokens(&marker_history);
    assert!(
        !should_trigger_compact(used_after, MAX_TOKENS, Some(THRESHOLD)),
        "marker 存在时估算 {used_after} 不应触发压缩"
    );
}

/// 压缩持久化只看 SQLite 快照，不看内存里的 `apply_compact` 结果。
/// 当工具输出尚未落库时，整个会话看起来都 fit 在保留窗口内，
/// `persist_session_compact` 会静默 noop，留下“内存已压缩、DB 无 marker”。
#[test]
fn stale_db_snapshot_makes_compact_persist_silently_noop() {
    let workspace = temp_dir("workspace-stale-snapshot");
    std::fs::create_dir_all(&workspace).expect("workspace");
    let data_dir = temp_dir("data-stale-snapshot");
    std::fs::create_dir_all(&data_dir).expect("data dir");
    let db = Database::new(&data_dir).expect("db");
    let session = sample_session(&workspace);
    put_session(&db, &session).expect("put session");

    let old_user = user_record(&session.id, "old", 100);
    let assistant = assistant_record(&session.id, "ok", 200);
    put_record(&db, old_user);
    put_record(&db, assistant.clone());

    // 压缩瞬间 DB 快照里还没有工具输出（工具输出仍只在内存/流式缓冲中）。
    let persisted = persist_session_compact(
        &db,
        &session.id,
        "Concise summary.",
        COMPACT_USER_MESSAGE_MAX_TOKENS,
        "## Context Compaction Summary\n\n",
        false,
    )
    .expect("persist compact");

    assert!(
        persisted.compact_message_id.is_empty(),
        "DB 快照被低估时 persist 会 noop，不写 compact marker"
    );
    assert_eq!(persisted.removed_count, 0);

    // 消息最终落库后补上巨大工具输出，同一份会话再次调用 persist 就能成功。
    let huge_output = "x".repeat(200_000);
    update_message(&db, &assistant.id, false, |message| {
        message.tool_invocations = vec![MessageToolInvocation {
            id: "tool-1".to_string(),
            name: "read_file".to_string(),
            input: json!({"path": "src/main.rs"}),
            output: Some(json!({"content": huge_output})),
            error_text: None,
            state: "completed".to_string(),
        }];
    })
    .expect("update assistant with tool output");

    let persisted = persist_session_compact(
        &db,
        &session.id,
        "Concise summary.",
        COMPACT_USER_MESSAGE_MAX_TOKENS,
        "## Context Compaction Summary\n\n",
        false,
    )
    .expect("persist compact");

    assert!(
        !persisted.compact_message_id.is_empty(),
        "工具输出落库后应能建立 compact marker"
    );
    let messages = get_messages_by_session(&db, &session.id).expect("messages");
    assert!(
        messages
            .iter()
            .any(|record| record.message_kind.as_deref() == Some("compact")),
        "SQLite 中应存在 compact marker"
    );
}

/// 直接用用户提供的生产库复现：session d56727a4-4500-4451-91f1-1fb7b002129a
/// 有 auto-compact 过程步骤但没有 compact marker，因此模型历史重建为全量，
/// 下一条用户消息发出后第一轮就会再次压缩。
#[test]
fn production_db_missing_marker_matches_retrigger_chain() {
    let Some(db) = open_prod_db_from_env() else {
        eprintln!("SKIP: 未设置 CODER_TEST_PROD_DB");
        return;
    };

    let session_id = "d56727a4-4500-4451-91f1-1fb7b002129a";
    let mut records = get_messages_by_session(&db, session_id).expect("production messages");
    records.sort_by_key(|record| record.created_at);

    let compact_steps: Vec<&MessageRecord> = records
        .iter()
        .filter(|record| {
            record
                .process_steps
                .as_deref()
                .is_some_and(|steps| {
                    steps
                        .iter()
                        .any(|step| matches!(step, MessageProcessStep::Compact { .. }))
                })
        })
        .collect();
    assert_eq!(
        compact_steps.len(),
        3,
        "生产 session 应存在 3 次 auto-compact 过程步骤"
    );
    assert!(
        records
            .iter()
            .all(|record| record.message_kind.as_deref() != Some("compact")),
        "生产 session 不应存在独立 compact marker"
    );
    assert!(
        compact_steps
            .iter()
            .any(|record| first_step_is_compact(record)),
        "至少有一次压缩是 assistant 消息 processSteps 的第一个步骤，\
         即新 run 第一轮就压缩"
    );

    let history = model_history_from_latest_compact(records.clone());
    assert_eq!(
        history.len(),
        records.len(),
        "无 marker 时模型历史会退化为全量"
    );
    let used = total_tokens(&history);
    assert!(
        should_trigger_compact(used, PROD_MAX_TOKENS, Some(THRESHOLD)),
        "生产全量历史估算 {used} 应超过 1M 窗口的 80% 阈值"
    );

    // 但模型真实返回的 prompt_tokens 峰值也只有约 22%：
    // 后端新 run 首轮若退化为全量启发式估算，就会在用户发消息后立即压缩，
    // 与 UI 显示的真实 usage 完全不一致。
    let real_prompt_tokens = records
        .iter()
        .rev()
        .find_map(|record| {
            if record.role != "assistant" {
                return None;
            }
            record
                .usage
                .as_ref()
                .map(|usage| usage.prompt_tokens)
                .filter(|tokens| *tokens > 0)
        })
        .expect("生产 session 应存在 provider usage");
    let peak_prompt_tokens = records
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
        .max()
        .expect("生产 session 应存在 provider usage");
    assert_eq!(peak_prompt_tokens, 219_020);
    assert!(
        !should_trigger_compact(real_prompt_tokens, PROD_MAX_TOKENS, Some(THRESHOLD)),
        "最新真实 usage {real_prompt_tokens} 远低于 1M 窗口的 80%，不应触发压缩"
    );
    assert!(
        !should_trigger_compact(peak_prompt_tokens, PROD_MAX_TOKENS, Some(THRESHOLD)),
        "峰值真实 usage {peak_prompt_tokens} 只占 1M 窗口的约 22%，不应触发压缩"
    );
}

/// 修复验证：新 run 首轮恢复最近一次真实 usage 基线后，
/// 即使 DB 中仍没有 compact marker，也不会在用户发消息后第一轮就压缩。
#[test]
fn new_run_restoring_real_usage_baseline_does_not_trigger_early() {
    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: Some(json!("刚刚发送的新消息")),
        reasoning_content: None,
        tool_calls: None,
        tool_call_id: None,
        name: None,
    }];

    // 修复后：新 run 从 DB 恢复上次真实 usage，并把基线长度设为当前消息数，
    // 首轮只沿用真实占用，不做全量启发式估算。
    let baseline = Some(219_020);
    let usage = estimate_prompt_usage(&messages, baseline, messages.len());
    assert_eq!(usage, 219_020);
    assert!(
        !should_trigger_compact(usage, PROD_MAX_TOKENS, Some(THRESHOLD)),
        "恢复真实基线后不应立即触发压缩"
    );

    // 对照组：没有基线时退化为全量估算，大工具输出会立刻触发压缩。
    let huge = ChatMessage {
        role: "tool".to_string(),
        content: Some(json!("x".repeat(2_000_000))),
        reasoning_content: None,
        tool_calls: None,
        tool_call_id: Some("tool-1".to_string()),
        name: Some("read_file".to_string()),
    };
    let no_baseline_usage = estimate_prompt_usage(&[huge], None, 0);
    assert!(
        should_trigger_compact(no_baseline_usage, PROD_MAX_TOKENS, Some(THRESHOLD)),
        "无基线时全量启发式估算 {no_baseline_usage} 会提前触发压缩"
    );
}
