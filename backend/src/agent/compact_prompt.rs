//! Compact prompt templates — natural language summarisation for context compaction.
//!
//! When the agent's working context approaches the token budget limit, we ask the
//! model to write a concise summary in natural language. The old messages are then
//! replaced by that summary, freeing context space without creating a new session.
//!
//! Design principles:
//! - Trust the LLM's natural language capabilities — a short prompt is enough.
//! - The summary should read like a colleague's sticky note, not a database record.
//! - No structured rules, no JSON schemas, no defensive checklists.

/// The core compaction prompt sent to the model.
///
/// This is deliberately minimal. Codex proves that a short, clear prompt
/// produces better summaries than a long, defensive one. The model knows best
/// what the next LLM needs to continue the work.
pub const SUMMARIZATION_PROMPT: &str = r#"You are performing a CONTEXT CHECKPOINT COMPACTION. Create a summary for another LLM that will resume the task.

Include:
- Current progress and key decisions made
- Important context, constraints, or user preferences
- What remains to be done (clear next steps)
- Any critical data, examples, or references needed to continue

Be concise, structured, and focused on helping the next LLM seamlessly continue the work."#;

/// Injected before the compact summary when resuming after a compaction.
///
/// The new LLM receives this prefix followed by the summary. It tells the model
/// to treat the summary as authoritative context from a previous session.
pub const COMPACT_SUMMARY_PREFIX: &str = "The previous conversation was compacted due to context limits. A summary of the work done so far is provided below. Use this summary to continue the task without duplicating effort:\n\n";

/// Prompt template for the final compaction at task completion.
///
/// When the agent successfully completes a task and the session is about to end,
/// this prompt produces an archive-quality summary that can be used for future
/// reference or for continuing related work.
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
    fn summarization_prompt_is_non_empty() {
        assert!(!SUMMARIZATION_PROMPT.is_empty());
        assert!(SUMMARIZATION_PROMPT.contains("CONTEXT CHECKPOINT COMPACTION"));
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
