//! 上下文压缩相关的提示词模板。
//!
//! 压缩时不把历史对话做成有损摘录：原始对话原样作为输入，末尾追加一条
//! 自然语言的 user 指令，让模型像人工“停止会话、请求总结”一样输出摘要。
//!
//! 设计原则：
//! - 输入保持全量，不截断、不展平、不发明新的消息结构；
//! - 指令自然，不使用伪术语或长篇结构化要求；
//! - 摘要服务于后续继续任务，而不是写一段闲聊式复述。

/// 追加到原始对话末尾的自然语言 user 指令。
pub const COMPACT_REQUEST_MESSAGE: &str = "上下文快不够了，请总结当前进度、关键决定和接下来要做什么，这样我们可以在下一段对话里继续这个任务。";

/// 压缩摘要重新进入模型上下文时使用的前缀。
pub const COMPACT_SUMMARY_PREFIX: &str = "The previous conversation was compacted due to context limits. A summary of the work done so far is provided below. Use this summary to continue the task without duplicating effort:\n\n";

/// 任务完成时的最终归档摘要提示词。
pub const FINAL_COMPACT_PROMPT: &str = r#"Create a final task summary for archival and potential future resumption.

Include:
- What was accomplished (the final outcome)
- Key technical decisions and their rationale
- Files created or modified (paths and purpose)
- Any unresolved work or follow-up tasks
- Patterns or conventions established during the work

This summary will be stored and may be referenced by future sessions working on the same project."#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compact_request_message_is_natural() {
        assert!(!COMPACT_REQUEST_MESSAGE.is_empty());
        assert!(COMPACT_REQUEST_MESSAGE.contains("总结"));
        assert!(!COMPACT_REQUEST_MESSAGE.contains("CONTEXT CHECKPOINT"));
    }

    #[test]
    fn compact_summary_prefix_includes_key_instruction() {
        assert!(COMPACT_SUMMARY_PREFIX.contains("summary"));
        assert!(COMPACT_SUMMARY_PREFIX.contains("continue the task"));
    }

    #[test]
    fn final_compact_prompt_asks_for_files() {
        assert!(FINAL_COMPACT_PROMPT.contains("Files created or modified"));
    }
}
