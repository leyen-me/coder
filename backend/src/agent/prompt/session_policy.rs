#[derive(Debug, Clone)]
pub struct SessionPolicyInput {
    pub session_kind: String,
    pub autonomy_mode: String,
    pub decision_policy_version: String,
    pub decision_model: Option<String>,
}

pub fn is_long_task_session(session_kind: &str, autonomy_mode: &str) -> bool {
    session_kind.trim() == "long_task" || autonomy_mode.trim() == "unattended"
}

pub fn build_session_policy_prompt(input: &SessionPolicyInput) -> Option<String> {
    if !is_long_task_session(&input.session_kind, &input.autonomy_mode) {
        return None;
    }

    let decision_model = input
        .decision_model
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("default");

    Some(
        [
            "## Session execution policy",
            &format!("- sessionKind: {}", input.session_kind.trim()),
            &format!("- autonomyMode: {}", input.autonomy_mode.trim()),
            &format!(
                "- decisionPolicyVersion: {}",
                input.decision_policy_version.trim()
            ),
            &format!("- decisionModel: {decision_model}"),
            "- This is a long-running unattended task session.",
            "- Work autonomously until the task is genuinely complete.",
            "- When your latest reply would normally hand control back to the user, a proxy agent will decide whether the task is complete or provide the next user-style continuation input.",
            "- Do not stop for low-risk follow-up questions when you can continue making progress yourself.",
        ]
        .join("\n"),
    )
}
