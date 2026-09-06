//! 上下文压缩相关的提示词模板。
//!
//! 压缩时不把历史对话做成有损摘录：原始对话原样作为输入，末尾追加一条
//! 自然语言的 user 指令，让模型像人工"停止会话、请求交接"一样输出结构化
//! Handoff。Handoff 随后以 user 消息身份进入下一轮上下文。
//!
//! 设计原则：
//! - 输入保持全量，不截断、不展平、不发明新的消息结构；
//! - 指令要求不调用任何工具，直接产出 handoff；
//! - Handoff 服务于后续继续任务，而不是写一段闲聊式复述。

/// 追加到原始对话末尾的自然语言 user 指令（handoff 模板）。
pub const COMPACT_REQUEST_MESSAGE: &str = r#"Your context is running low, so this conversation will be replaced by your handoff below. Write the handoff for the next model that continues this task without the full history.

Do NOT call any tools — answer directly from what you already know in this conversation. If an earlier handoff message exists in this conversation, carry its historical context forward into yours. Write the ENTIRE handoff in the language of the conversation (match the user's language), following exactly this structure:

# [Project / Task Name] - Coder Handoff

## 1. Context & Goal
* **Context**: one or two sentences on what this task is about and where it stands.
* **Goal**: one sentence stating the final outcome this task must achieve (feature delivered / bug fixed).
* **Key files**: core file/directory paths involved (e.g. `src/services/auth.ts`).

## 2. Current Status
* [x] Completed step: what was done and how it was verified
* [ ] Pending step: what remains, in order

## 3. Key Decisions & Learnings
* **Decision**: why approach A was chosen over B (e.g. `split User Context into its own file to avoid a circular dependency`).
* **Pitfall avoided**: an error that was hit and why it happened (e.g. `calling X directly deadlocks Async Storage`).

## 4. Next Steps for Next Session
1. Concrete, ordered actions the next model should take first (open which file, call which function).
2. ...

## 5. Verification Commands
* Test: exact command(s) to run and what passing looks like
* Run: exact command(s) to start/verify the app"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compact_request_message_is_natural() {
        assert!(!COMPACT_REQUEST_MESSAGE.is_empty());
        assert!(COMPACT_REQUEST_MESSAGE.contains("Coder Handoff"));
        assert!(COMPACT_REQUEST_MESSAGE.contains("Do NOT call any tools"));
        assert!(COMPACT_REQUEST_MESSAGE.contains("language of the conversation"));
    }

    #[test]
    fn compact_request_message_asks_for_all_sections() {
        for section in [
            "Context & Goal",
            "Current Status",
            "Key Decisions & Learnings",
            "Next Steps for Next Session",
            "Verification Commands",
        ] {
            assert!(
                COMPACT_REQUEST_MESSAGE.contains(section),
                "missing section: {section}"
            );
        }
    }

    #[test]
    fn compact_request_message_carries_forward_previous_handoffs() {
        assert!(COMPACT_REQUEST_MESSAGE.contains("earlier handoff"));
    }
}
