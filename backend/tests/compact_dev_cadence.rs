//! 复现并验证“压缩完成后，用户发送新消息又立刻自动压缩”的 dev cadence 根因。
//!
//! 旧行为：`run_agent_loop` 的 dev 消息数基线每次新 run 都从 0 开始，
//! 而压缩后保留的历史消息仍然可见，因此新 run 首轮就满足
//! `count >= CODER_AUTO_COMPACT_EVERY_N_MESSAGES`，在上下文占用很低时
//! 也会立即再次自动压缩。

use coder_lib::agent::compact::{
    count_compactable_messages, should_trigger_dev_auto_compact,
};
use coder_lib::agent::ChatMessage;
use serde_json::json;

fn make_msg(role: &str, content: &str) -> ChatMessage {
    ChatMessage {
        role: role.to_string(),
        content: Some(json!(content)),
        reasoning_content: None,
        tool_calls: None,
        tool_call_id: None,
        name: None,
    }
}

/// 测试结束时恢复调用前的环境变量，避免影响其他测试。
struct DevCadenceEnvGuard {
    allowed: Option<String>,
    every_n: Option<String>,
}

impl DevCadenceEnvGuard {
    fn enable() -> Self {
        let allowed = std::env::var("CODER_ALLOW_DEV_AUTO_COMPACT").ok();
        let every_n = std::env::var("CODER_AUTO_COMPACT_EVERY_N_MESSAGES").ok();
        std::env::set_var("CODER_ALLOW_DEV_AUTO_COMPACT", "1");
        std::env::set_var("CODER_AUTO_COMPACT_EVERY_N_MESSAGES", "4");
        Self { allowed, every_n }
    }
}

impl Drop for DevCadenceEnvGuard {
    fn drop(&mut self) {
        match &self.allowed {
            Some(value) => std::env::set_var("CODER_ALLOW_DEV_AUTO_COMPACT", value),
            None => std::env::remove_var("CODER_ALLOW_DEV_AUTO_COMPACT"),
        }
        match &self.every_n {
            Some(value) => std::env::set_var("CODER_AUTO_COMPACT_EVERY_N_MESSAGES", value),
            None => std::env::remove_var("CODER_AUTO_COMPACT_EVERY_N_MESSAGES"),
        }
    }
}

#[test]
fn dev_cadence_does_not_re_trigger_on_resumed_history() {
    std::env::remove_var("CODER_ALLOW_DEV_AUTO_COMPACT");
    std::env::remove_var("CODER_AUTO_COMPACT_EVERY_N_MESSAGES");
    let history = vec![
        make_msg("user", "old request"),
        make_msg("assistant", "old answer"),
        make_msg("user", "another old request"),
        make_msg("assistant", "another old answer"),
        make_msg("user", "kept tail after compact"),
    ];
    assert!(
        !should_trigger_dev_auto_compact(&history, 0),
        "未启用 dev cadence 时不得触发"
    );

    let _guard = DevCadenceEnvGuard::enable();
    assert!(
        should_trigger_dev_auto_compact(&history, 0),
        "旧行为：新 run 基线为 0 时，压缩后保留的历史消息会立即触发"
    );

    // 修复后：新 run 的基线取当前可见历史消息数，首轮不会触发。
    let baseline = count_compactable_messages(&history);
    assert_eq!(baseline, 5);
    assert!(
        !should_trigger_dev_auto_compact(&history, baseline),
        "新 run 首轮不得因压缩后保留的历史消息触发"
    );

    // 新增消息达到 N 条后才触发，符合“每 N 条消息”语义。
    let mut grown = history;
    for index in 0..4 {
        grown.push(make_msg(
            if index % 2 == 0 { "user" } else { "assistant" },
            &format!("new message {index}"),
        ));
    }
    assert!(
        should_trigger_dev_auto_compact(&grown, baseline),
        "新增 N 条消息后应正常触发"
    );
}
