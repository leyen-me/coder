use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{
    loop_::AgentLoopError,
    types::{AgentContextUsageSnapshot, AgentEvent, AgentStartParams, ChatMessage},
};
use crate::{
    db::{
        records::{
            current_timestamp_ms, normalize_provider, MessageProcessStep,
            MessageRecord, MessageToolInvocation, SessionRecord,
        },
        session_store::{
            copy_active_agent_todos, get_messages_by_session, get_session, new_message_id,
            new_session_id, put_message, put_session, update_session,
        },
    },
    tools::{shell::ShellStatus, shell_list, tool_collect_git_snapshot},
    AppState, SseBroadcaster,
};
use std::sync::{Arc, Mutex};

const HANDOFF_ARTIFACT_HEADING: &str = "# Automatic Session Handoff";
const HANDOFF_CONTINUATION_PROMPT_PREFIX: &str =
    "A previous session of this task reached its context budget and handed off the work.";
const HANDOFF_SYSTEM_PROMPT: &str = r#"Create a handoff document for a fresh session that has no memory of the previous conversation.
The next session should trust the working set and archived tool outputs, continuing immediately with minimal verification.

Handoff requirements:
- Preserve intent, constraints, decisions, evidence, and next steps.
- Call out any risky or destructive next actions explicitly.
- Mention unfinished tools, background jobs, watchers, or commands only if they are actually known from the conversation.
- Prefer autonomous continuation. If the original task would normally require clarification, recommend the safest reasonable default and record that assumption explicitly.
- Only describe the task as blocked if there is truly no reasonable action the next session can take.
- Include at least one concrete file path in Pending Next Actions when files were touched.
- If no tests were run, write Unknown under Artifacts And Evidence."#;

#[derive(Debug, Clone)]
pub struct HandoffOutcome {
    pub continued_session_id: String,
    pub continued_task_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VerificationSnapshot {
    last_test_command: Option<String>,
    last_test_exit_code: Option<i32>,
    last_build_command: Option<String>,
    last_build_exit_code: Option<i32>,
    failing_command_snippet: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackgroundJobSnapshot {
    shell_id: String,
    command: String,
    working_directory: String,
    status: String,
    exit_code: Option<i32>,
    last_output: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HandoffWorkingSetEntry {
    path: String,
    operation_type: String,
    last_operation: String,
    created_at: u64,
    needs_verification: Option<bool>,
    last_known_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct HandoffSupplementalContext {
    working_set: Vec<HandoffWorkingSetEntry>,
    git_snapshot: Option<crate::tools::GitSnapshotResult>,
    verification: Option<VerificationSnapshot>,
    background_jobs: Vec<BackgroundJobSnapshot>,
    history_file_path: Option<String>,
    tool_archive_index_path: Option<String>,
    chain_manifest_path: Option<String>,
    assumptions: Vec<String>,
    known_errors: Vec<String>,
    decision_summaries: Vec<String>,
}

pub async fn continue_after_handoff(
    params: &AgentStartParams,
    current_messages: &[ChatMessage],
    context_usage: &AgentContextUsageSnapshot,
    broadcaster: &Arc<SseBroadcaster>,
    registry: &Arc<Mutex<super::registry::AgentRegistry>>,
    app_state: Arc<AppState>,
) -> Result<HandoffOutcome, AgentLoopError> {
    let Some(session_id) = params
        .session_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Err(AgentLoopError::Other(
            "Context handoff requires an active session.".to_string(),
        ));
    };

    set_session_handoff_phase(&app_state, session_id, Some("generating_handoff"))?;

    emit_event(
        registry,
        broadcaster,
        &params.task_id,
        AgentEvent::HandoffProgress {
            task_id: params.task_id.clone(),
            session_id: session_id.to_string(),
            phase: "generating_handoff".to_string(),
        },
    )?;

    let (source_session, source_messages) = {
        let db = app_state
            .db
            .lock()
            .map_err(|_| AgentLoopError::Other("Database lock poisoned".to_string()))?;
        let source_session = get_session(&db, session_id)
            .map_err(AgentLoopError::Other)?
            .ok_or_else(|| AgentLoopError::Other(format!("Session not found: {session_id}")))?;
        let source_messages =
            get_messages_by_session(&db, session_id).map_err(AgentLoopError::Other)?;
        (source_session, source_messages)
    };

    let handoff_body = generate_handoff_body(
        &source_session.title,
        params,
        current_messages,
        context_usage,
    )
        .await
        .unwrap_or_else(|_| {
            build_fallback_handoff_body(
                latest_user_message_text(&source_messages).unwrap_or_default(),
                &source_session.title,
            )
        });

    set_session_handoff_phase(&app_state, session_id, Some("creating_session"))?;
    emit_event(
        registry,
        broadcaster,
        &params.task_id,
        AgentEvent::HandoffProgress {
            task_id: params.task_id.clone(),
            session_id: session_id.to_string(),
            phase: "creating_session".to_string(),
        },
    )?;

    let continued_session = create_continuation_session(&app_state, &source_session)?;
    let verification = collect_verification_snapshot(&source_messages);
    let background_jobs = collect_background_job_snapshot(&app_state, &params.task_id);
    let git_snapshot = source_session
        .workspace_dir
        .as_deref()
        .and_then(|workspace| tool_collect_git_snapshot(workspace.to_string()).ok());
    let working_set = extract_working_set(&source_messages, 12);
    let decision_summaries = extract_decision_summaries(&source_messages, 3);
    let known_errors = extract_known_error_fingerprints(&source_messages);
    let supplemental_context = HandoffSupplementalContext {
        working_set: working_set.clone(),
        git_snapshot: git_snapshot.clone(),
        verification: verification.clone(),
        background_jobs: background_jobs.clone(),
        history_file_path: None,
        tool_archive_index_path: None,
        chain_manifest_path: None,
        assumptions: Vec::new(),
        known_errors,
        decision_summaries,
    };
    let verification_checklist = build_verification_checklist(
        verification.as_ref(),
        &working_set,
        &background_jobs,
    );
    let generated_at = chrono::DateTime::from_timestamp_millis(current_timestamp_ms() as i64)
        .map(|timestamp| timestamp.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
        .unwrap_or_else(|| "1970-01-01T00:00:00.000Z".to_string());
    let handoff_artifact = build_stored_handoff_artifact(
        &source_session,
        &continued_session,
        params,
        context_usage,
        &handoff_body,
        &generated_at,
        &supplemental_context,
    );
    let continuation_prompt = build_continuation_prompt(
        &handoff_artifact,
        &source_session.title,
        &source_session.session_kind,
        &source_session.autonomy_mode,
        &source_session.decision_policy_version,
        &working_set,
        &verification_checklist,
        supplemental_context.tool_archive_index_path.as_deref(),
        supplemental_context.history_file_path.as_deref(),
        supplemental_context.chain_manifest_path.as_deref(),
    );

    let continued_task_id = uuid::Uuid::new_v4().to_string();
    let _continued_assistant_message_id = {
        let now = current_timestamp_ms();
        let handoff_message = MessageRecord {
            id: new_message_id(),
            session_id: source_session.id.clone(),
            role: "assistant".to_string(),
            message_kind: Some("handoff".to_string()),
            content: handoff_artifact,
            images: None,
            referenced_skills: None,
            thinking: String::new(),
            process_steps: Some(Vec::<MessageProcessStep>::new()),
            tool_invocations: Vec::<MessageToolInvocation>::new(),
            status: "completed".to_string(),
            task_id: None,
            error: None,
            created_at: now,
            duration_ms: None,
            usage: None,
        };
        let continuation_message = MessageRecord {
            id: new_message_id(),
            session_id: continued_session.id.clone(),
            role: "user".to_string(),
            message_kind: Some("handoff_continuation".to_string()),
            content: continuation_prompt.clone(),
            images: None,
            referenced_skills: None,
            thinking: String::new(),
            process_steps: Some(Vec::<MessageProcessStep>::new()),
            tool_invocations: Vec::<MessageToolInvocation>::new(),
            status: "completed".to_string(),
            task_id: None,
            error: None,
            created_at: now.saturating_add(1),
            duration_ms: None,
            usage: None,
        };
        let assistant_message = MessageRecord {
            id: new_message_id(),
            session_id: continued_session.id.clone(),
            role: "assistant".to_string(),
            message_kind: if params.agent_mode.as_deref() == Some("plan") {
                Some("plan".to_string())
            } else {
                None
            },
            content: String::new(),
            images: None,
            referenced_skills: None,
            thinking: String::new(),
            process_steps: Some(Vec::<MessageProcessStep>::new()),
            tool_invocations: Vec::<MessageToolInvocation>::new(),
            status: "pending".to_string(),
            task_id: Some(continued_task_id.clone()),
            error: None,
            created_at: now.saturating_add(2),
            duration_ms: None,
            usage: None,
        };

        let db = app_state
            .db
            .lock()
            .map_err(|_| AgentLoopError::Other("Database lock poisoned".to_string()))?;
        copy_active_agent_todos(&db, &source_session.id, &continued_session.id)
            .map_err(AgentLoopError::Other)?;
        put_message(&db, &handoff_message, true).map_err(AgentLoopError::Other)?;
        put_message(&db, &continuation_message, true).map_err(AgentLoopError::Other)?;
        put_message(&db, &assistant_message, true).map_err(AgentLoopError::Other)?;
        let _ = update_session(&db, &continued_session.id, |session| {
            session.handoff_message_id = Some(handoff_message.id.clone());
        })
        .map_err(AgentLoopError::Other)?;
        assistant_message.id
    };

    set_session_handoff_phase(&app_state, session_id, Some("starting_new_session"))?;
    emit_event(
        registry,
        broadcaster,
        &params.task_id,
        AgentEvent::HandoffProgress {
            task_id: params.task_id.clone(),
            session_id: source_session.id.clone(),
            phase: "starting_new_session".to_string(),
        },
    )?;

    let continuation_messages = build_continuation_messages(current_messages, &continuation_prompt);
    super::agent_start(
        &app_state.agent_registry,
        AgentStartParams {
            task_id: continued_task_id.clone(),
            session_id: Some(continued_session.id.clone()),
            messages: continuation_messages,
            ..params.clone()
        },
        app_state.sse_broadcaster.clone(),
        app_state.clone(),
    )
    .map_err(AgentLoopError::Other)?;

    set_session_handoff_phase(&app_state, session_id, None)?;

    emit_event(
        registry,
        broadcaster,
        &params.task_id,
        AgentEvent::HandoffComplete {
            task_id: params.task_id.clone(),
            source_session_id: source_session.id,
            continued_session_id: continued_session.id.clone(),
        },
    )?;

    Ok(HandoffOutcome {
        continued_session_id: continued_session.id,
        continued_task_id,
    })
}

fn set_session_handoff_phase(
    app_state: &AppState,
    session_id: &str,
    phase: Option<&str>,
) -> Result<(), AgentLoopError> {
    let db = app_state
        .db
        .lock()
        .map_err(|_| AgentLoopError::Other("Database lock poisoned".to_string()))?;
    let _ = update_session(&db, session_id, |session| {
        session.handoff_phase = phase.map(str::to_string);
    })
    .map_err(AgentLoopError::Other)?;
    Ok(())
}

async fn generate_handoff_body(
    source_session_title: &str,
    params: &AgentStartParams,
    current_messages: &[ChatMessage],
    context_usage: &AgentContextUsageSnapshot,
) -> Result<String, String> {
    let mut messages = current_messages.to_vec();
    messages.push(ChatMessage {
        role: "system".to_string(),
        content: Some(Value::String(HANDOFF_SYSTEM_PROMPT.to_string())),
        reasoning_content: None,
        tool_calls: None,
        tool_call_id: None,
        name: None,
    });
    messages.push(ChatMessage {
        role: "user".to_string(),
        content: Some(Value::String(build_agent_handoff_user_prompt(
            source_session_title,
            context_usage,
            params.session_kind.as_deref().unwrap_or("standard"),
            params.autonomy_mode.as_deref().unwrap_or("interactive"),
            params
                .decision_policy_version
                .as_deref()
                .unwrap_or("mvp-v1"),
            params.decision_model.as_deref(),
            None,
        ))),
        reasoning_content: None,
        tool_calls: None,
        tool_call_id: None,
        name: None,
    });
    super::openai::complete_chat_completion(
        &reqwest::Client::new(),
        super::openai::chat_completions_url(&params.base_url),
        params.api_key.as_deref().unwrap_or_default(),
        &params.model,
        &messages,
        4096,
    )
    .await?
    .ok_or_else(|| "Handoff model returned empty content".to_string())
}

fn create_continuation_session(
    app_state: &AppState,
    source_session: &SessionRecord,
) -> Result<SessionRecord, AgentLoopError> {
    let now = current_timestamp_ms();
    let next_session = SessionRecord {
        id: new_session_id(),
        title: derive_continuation_session_title(&source_session.title),
        model: source_session.model.clone(),
        provider: normalize_provider(&source_session.provider, &source_session.model),
        workspace_dir: source_session.workspace_dir.clone(),
        session_kind: source_session.session_kind.clone(),
        autonomy_mode: source_session.autonomy_mode.clone(),
        decision_policy_version: source_session.decision_policy_version.clone(),
        decision_model: source_session.decision_model.clone(),
        parent_session_id: Some(source_session.id.clone()),
        handoff_from_session_id: Some(source_session.id.clone()),
        handoff_message_id: None,
        handoff_phase: None,
        plan_file_name: source_session.plan_file_name.clone(),
        plan_built_at: source_session.plan_built_at,
        context_usage_snapshot: None,
        pinned_at: None,
        created_at: now,
        updated_at: now,
    };
    let db = app_state
        .db
        .lock()
        .map_err(|_| AgentLoopError::Other("Database lock poisoned".to_string()))?;
    put_session(&db, &next_session).map_err(AgentLoopError::Other)?;
    Ok(next_session)
}

fn build_continuation_messages(
    current_messages: &[ChatMessage],
    continuation_prompt: &str,
) -> Vec<ChatMessage> {
    let mut messages = current_messages
        .iter()
        .filter(|message| message.role == "system")
        .cloned()
        .collect::<Vec<_>>();
    messages.push(ChatMessage {
        role: "user".to_string(),
        content: Some(Value::String(continuation_prompt.to_string())),
        reasoning_content: None,
        tool_calls: None,
        tool_call_id: None,
        name: None,
    });
    messages
}

fn build_agent_handoff_user_prompt(
    session_title: &str,
    context_usage: &AgentContextUsageSnapshot,
    session_kind: &str,
    autonomy_mode: &str,
    decision_policy_version: &str,
    decision_model: Option<&str>,
    quality_failures: Option<&[String]>,
) -> String {
    let mut lines = vec![
        "Create a handoff document for a fresh session that has no memory of the previous conversation.".to_string(),
        "The next session should trust the working set and archived tool outputs, continuing immediately with minimal verification.".to_string(),
        String::new(),
        "Handoff requirements:".to_string(),
        "- Preserve intent, constraints, decisions, evidence, and next steps.".to_string(),
        "- Call out any risky or destructive next actions explicitly.".to_string(),
        "- Mention unfinished tools, background jobs, watchers, or commands only if they are actually known from the conversation.".to_string(),
        "- Prefer autonomous continuation. If the original task would normally require clarification, recommend the safest reasonable default and record that assumption explicitly.".to_string(),
        "- Only describe the task as blocked if there is truly no reasonable action the next session can take.".to_string(),
        "- Include at least one concrete file path in Pending Next Actions when files were touched.".to_string(),
        "- If no tests were run, write Unknown under Artifacts And Evidence.".to_string(),
        String::new(),
        "Current rollover context:".to_string(),
        format!("- sourceSessionTitle: {}", sanitize_inline_value(session_title)),
        format!("- sessionKind: {session_kind}"),
        format!("- autonomyMode: {autonomy_mode}"),
        format!("- decisionPolicyVersion: {decision_policy_version}"),
        format!("- decisionModel: {}", decision_model.unwrap_or("default")),
        format!("- usedTokens: {}", context_usage.used_tokens),
        format!("- maxTokens: {}", context_usage.max_tokens),
        format!("- remainingTokens: {}", context_usage.remaining_tokens),
        format!("- reservedTokens: {}", context_usage.reserved_tokens),
        format!("- triggerThreshold: {}", context_usage.trigger_threshold),
    ];

    if let Some(quality_failures) = quality_failures.filter(|items| !items.is_empty()) {
        lines.push(String::new());
        lines.push("Previous attempt failed quality checks. Fix these issues:".to_string());
        for failure in quality_failures {
            lines.push(format!("- {failure}"));
        }
    }

    lines.join("\n")
}

fn build_stored_handoff_artifact(
    source_session: &SessionRecord,
    continued_session: &SessionRecord,
    params: &AgentStartParams,
    context_usage: &AgentContextUsageSnapshot,
    handoff_body: &str,
    generated_at: &str,
    supplemental_context: &HandoffSupplementalContext,
) -> String {
    let body = normalize_handoff_body(&build_augmented_handoff_body(
        handoff_body,
        supplemental_context,
    ));
    [
        HANDOFF_ARTIFACT_HEADING.to_string(),
        String::new(),
        format!("- sourceSessionId: {}", source_session.id),
        format!("- continuedSessionId: {}", continued_session.id),
        format!("- sourceSessionTitle: {}", sanitize_inline_value(&source_session.title)),
        format!("- generatedAt: {}", sanitize_inline_value(generated_at)),
        format!("- model: {}", sanitize_inline_value(&params.model)),
        format!("- sessionKind: {}", source_session.session_kind),
        format!("- autonomyMode: {}", source_session.autonomy_mode),
        format!(
            "- decisionPolicyVersion: {}",
            sanitize_inline_value(&source_session.decision_policy_version)
        ),
        format!(
            "- decisionModel: {}",
            sanitize_inline_value(source_session.decision_model.as_deref().unwrap_or("default"))
        ),
        format!(
            "- contextBudget: {}/{} used, {} remaining, reserve {}",
            context_usage.used_tokens,
            context_usage.max_tokens,
            context_usage.remaining_tokens,
            context_usage.reserved_tokens
        ),
        String::new(),
        body,
    ]
    .join("\n")
}

fn build_continuation_prompt(
    handoff_artifact: &str,
    source_session_title: &str,
    session_kind: &str,
    autonomy_mode: &str,
    decision_policy_version: &str,
    working_set: &[HandoffWorkingSetEntry],
    verification_checklist: &[String],
    tool_archive_index_path: Option<&str>,
    history_file_path: Option<&str>,
    chain_manifest_path: Option<&str>,
) -> String {
    let mut lines = vec![
        HANDOFF_CONTINUATION_PROMPT_PREFIX
            .to_string(),
        "Treat the handoff below as the authoritative working state written by the previous session."
            .to_string(),
        "Default to trusting the handoff, working set, code delta, and archived evidence."
            .to_string(),
        "Continue autonomously without waiting for user input whenever a safe, conservative, and reversible next step exists."
            .to_string(),
        "When clarification would normally help, choose the best reasonable default, record the assumption in your work, and keep moving."
            .to_string(),
        "Only stop to ask the user if proceeding is literally impossible without information that cannot be inferred or safely defaulted."
            .to_string(),
        String::new(),
        "Rules:".to_string(),
        "1. Execute Pending Next Actions immediately if the verification checklist passes.".to_string(),
        "2. Do NOT re-read files listed in the Working Set unless you are about to edit them, verification failed, or the handoff marks them as needs_verification.".to_string(),
        "3. Do NOT glob or broadly explore the codebase just to re-understand the project.".to_string(),
        "4. Prefer source session history and tool archive evidence over re-running prior read/search commands.".to_string(),
        "5. During the first 1-2 turns, keep exploration extremely small and justify any extra verification.".to_string(),
        String::new(),
        format!("Previous session: {}", sanitize_inline_value(source_session_title)),
        format!(
            "Session policy: {} / {} / {}",
            session_kind,
            autonomy_mode,
            sanitize_inline_value(decision_policy_version)
        ),
        String::new(),
    ];
    if !working_set.is_empty() {
        lines.push("## Continuation Working Set".to_string());
        for (index, entry) in working_set.iter().take(5).enumerate() {
            let mut flags = vec![entry.operation_type.clone()];
            flags.push(
                if entry.needs_verification.unwrap_or(false) {
                    "needs_verification".to_string()
                } else {
                    "trusted".to_string()
                },
            );
            lines.push(format!(
                "{}. {} ({})",
                index + 1,
                entry.path,
                flags.join(", ")
            ));
        }
        lines.push(String::new());
    }
    if !verification_checklist.is_empty() {
        lines.push("## Continuation Verification Checklist".to_string());
        for (index, item) in verification_checklist.iter().enumerate() {
            lines.push(format!("{}. {}", index + 1, item));
        }
        lines.push(String::new());
    }
    lines.push("## Exploration Budget (Turns 1-2)".to_string());
    lines.push("- Maximum 2 targeted file reads.".to_string());
    lines.push("- Zero broad glob/codebase exploration unless checklist verification fails.".to_string());
    lines.push("- Prefer archived tool output and git delta before re-running tools.".to_string());
    lines.push(String::new());
    if let Some(path) = tool_archive_index_path.filter(|value| !value.trim().is_empty()) {
        lines.push(format!("Tool archive index: {}", path.trim()));
        lines.push(String::new());
    }
    if let Some(path) = history_file_path.filter(|value| !value.trim().is_empty()) {
        lines.push(format!("Source session history: {}", path.trim()));
        lines.push(String::new());
    }
    if let Some(path) = chain_manifest_path.filter(|value| !value.trim().is_empty()) {
        lines.push(format!("Session chain manifest: {}", path.trim()));
        lines.push(String::new());
    }
    lines.push(handoff_artifact.trim().to_string());
    lines.join("\n")
}

fn build_fallback_handoff_body(user_content: String, source_session_title: &str) -> String {
    vec![
        "## Original User Intent".to_string(),
        user_content.trim().if_empty("Unknown"),
        String::new(),
        "## Current Objective".to_string(),
        format!(
            "Continue the task from session \"{}\".",
            sanitize_inline_value(source_session_title)
        ),
        String::new(),
        "## Constraints".to_string(),
        "- Preserve the user's original intent and avoid repeating completed work.".to_string(),
        String::new(),
        "## Completed".to_string(),
        "- Unknown. Review the previous session history before continuing.".to_string(),
        String::new(),
        "## In Progress".to_string(),
        "- Automatic handoff generation failed; verify the latest assistant message and tool outputs."
            .to_string(),
        String::new(),
        "## Pending Next Actions".to_string(),
        "1. Review the previous session's latest assistant/tool outputs.".to_string(),
        "2. Reconstruct the exact current state before making more changes.".to_string(),
        String::new(),
        "## Key Decisions".to_string(),
        "- Unknown".to_string(),
        String::new(),
        "## Rejected Or Superseded Approaches".to_string(),
        "- Unknown".to_string(),
        String::new(),
        "## Artifacts And Evidence".to_string(),
        "- Previous session chat history".to_string(),
        String::new(),
        "## Background Jobs And Follow-ups".to_string(),
        "- Unknown".to_string(),
        String::new(),
        "## Open Questions".to_string(),
        "- Unknown. If needed, proceed with conservative assumptions and record them.".to_string(),
        String::new(),
        "## Resume Instructions".to_string(),
        "Trust the latest persisted evidence first, then perform only the minimum verification needed to continue safely.".to_string(),
        "Continue autonomously using the safest reasonable defaults; only stop if progress is impossible without new external information.".to_string(),
    ]
    .join("\n")
}

fn derive_continuation_session_title(title: &str) -> String {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        "Continue · Session".to_string()
    } else {
        format!("Continue · {trimmed}")
    }
}

fn latest_user_message_text(messages: &[MessageRecord]) -> Option<String> {
    messages
        .iter()
        .rev()
        .find(|message| message.role == "user")
        .map(|message| message.content.clone())
}

fn build_augmented_handoff_body(
    handoff_body: &str,
    supplemental_context: &HandoffSupplementalContext,
) -> String {
    append_supplemental_sections(handoff_body, supplemental_context)
}

fn normalize_handoff_body(body: &str) -> String {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        build_fallback_handoff_body(String::new(), "")
    } else {
        trimmed.to_string()
    }
}

fn append_supplemental_sections(
    handoff_body: &str,
    supplemental_context: &HandoffSupplementalContext,
) -> String {
    let trimmed = handoff_body.trim();
    let mut sections = Vec::new();

    if !supplemental_context.working_set.is_empty() {
        sections.push("## Working Set".to_string());
        sections.push("| Path | Last Operation | Operation Type |".to_string());
        sections.push("|------|----------------|----------------|".to_string());
        for entry in &supplemental_context.working_set {
            sections.push(format!(
                "| {} | {} | {}{} |",
                entry.path,
                entry.last_operation,
                entry.operation_type,
                if entry.needs_verification.unwrap_or(false) {
                    " (needs_verification)"
                } else {
                    ""
                }
            ));
        }
        sections.push(String::new());
    }

    if let Some(git_snapshot) = &supplemental_context.git_snapshot {
        sections.push("## Code Delta".to_string());
        sections.push(format!(
            "- branch: {}",
            sanitize_inline_value(git_snapshot.branch.as_deref().unwrap_or("Unknown"))
        ));
        sections.push(String::new());
        sections.push("```text".to_string());
        sections.push(format_snapshot_block(
            "git status --short",
            &git_snapshot.status_short,
        ));
        sections.push(format_snapshot_block("git diff --stat", &git_snapshot.diff_stat));
        sections.push(format_snapshot_block("git diff", &git_snapshot.unstaged_diff));
        sections.push(format_snapshot_block(
            "git diff --staged",
            &git_snapshot.staged_diff,
        ));
        sections.push(format_snapshot_block(
            "git log --oneline -n 20",
            &git_snapshot.recent_log,
        ));
        sections.push("```".to_string());
        sections.push(String::new());
    }

    if let Some(verification) = &supplemental_context.verification {
        sections.push("## Verification".to_string());
        sections.push("```yaml".to_string());
        sections.push(format!(
            "last_test_command: {}",
            yaml_scalar_str(verification.last_test_command.as_deref())
        ));
        sections.push(format!(
            "last_test_exit_code: {}",
            yaml_scalar_i32(verification.last_test_exit_code)
        ));
        sections.push(format!(
            "last_build_command: {}",
            yaml_scalar_str(verification.last_build_command.as_deref())
        ));
        sections.push(format!(
            "last_build_exit_code: {}",
            yaml_scalar_i32(verification.last_build_exit_code)
        ));
        if let Some(snippet) = verification
            .failing_command_snippet
            .as_deref()
            .filter(|value| !value.trim().is_empty())
        {
            sections.push(format!("failure_snippet: {}", yaml_scalar_str(Some(snippet))));
        }
        sections.push("```".to_string());
        sections.push(String::new());
    }

    if !supplemental_context.background_jobs.is_empty() {
        sections.push("## Background Job Snapshot".to_string());
        for job in &supplemental_context.background_jobs {
            sections.push(format!(
                "- {}: {} ({}{})",
                job.shell_id,
                job.command,
                job.status,
                job.exit_code
                    .map(|code| format!(", exit {code}"))
                    .unwrap_or_default()
            ));
            if let Some(last_output) = job.last_output.as_deref() {
                sections.push(format!("  Last output: {last_output}"));
            }
        }
        sections.push(String::new());
    }

    if !supplemental_context.decision_summaries.is_empty() {
        sections.push("## Decision Trace".to_string());
        for summary in &supplemental_context.decision_summaries {
            sections.push(format!("- {summary}"));
        }
        sections.push(String::new());
    }

    if !supplemental_context.known_errors.is_empty() {
        sections.push("## Known Errors Already Investigated".to_string());
        for error in &supplemental_context.known_errors {
            sections.push(format!("- {error}"));
        }
        sections.push(String::new());
    }

    if !supplemental_context.assumptions.is_empty() {
        sections.push("## Assumptions".to_string());
        for assumption in &supplemental_context.assumptions {
            sections.push(format!("- {assumption}"));
        }
        sections.push(String::new());
    }

    if supplemental_context.history_file_path.is_some()
        || supplemental_context.tool_archive_index_path.is_some()
        || supplemental_context.chain_manifest_path.is_some()
    {
        sections.push("## Source Session Resources".to_string());
        if let Some(path) = supplemental_context.history_file_path.as_deref() {
            sections.push(format!("- history: {path}"));
        }
        if let Some(path) = supplemental_context.tool_archive_index_path.as_deref() {
            sections.push(format!("- toolArchiveIndex: {path}"));
        }
        if let Some(path) = supplemental_context.chain_manifest_path.as_deref() {
            sections.push(format!("- chainManifest: {path}"));
        }
        sections.push(String::new());
    }

    [trimmed, sections.join("\n").trim()]
        .into_iter()
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn format_snapshot_block(title: &str, content: &str) -> String {
    format!("$ {title}\n{}\n", content.trim().if_empty("(empty)"))
}

fn yaml_scalar_str(value: Option<&str>) -> String {
    value
        .map(|value| format!("{value:?}"))
        .unwrap_or_else(|| "Unknown".to_string())
}

fn yaml_scalar_i32(value: Option<i32>) -> String {
    value
        .map(|value| value.to_string())
        .unwrap_or_else(|| "Unknown".to_string())
}

fn build_verification_checklist(
    verification: Option<&VerificationSnapshot>,
    working_set: &[HandoffWorkingSetEntry],
    background_jobs: &[BackgroundJobSnapshot],
) -> Vec<String> {
    let mut checklist = Vec::new();

    if let Some(command) = verification
        .and_then(|snapshot| snapshot.last_test_command.as_deref())
        .filter(|value| !value.trim().is_empty())
    {
        let exit_code = verification
            .and_then(|snapshot| snapshot.last_test_exit_code)
            .map(|value| value.to_string())
            .unwrap_or_else(|| "Unknown".to_string());
        checklist.push(format!(
            "Re-run `{command}` and expect exit code {exit_code}."
        ));
    }

    if let Some(entry) = working_set.first() {
        checklist.push(format!(
            "Confirm `{}` still matches the handoff before editing.",
            entry.path
        ));
    }

    if let Some(job) = background_jobs.iter().find(|job| job.status == "running") {
        checklist.push(format!(
            "Check running shell {} in `{}` before starting duplicate processes.",
            job.shell_id, job.working_directory
        ));
    }

    if checklist.is_empty() {
        checklist.push(
            "Validate the immediately next file or command only if the handoff evidence looks stale."
                .to_string(),
        );
    }

    checklist
}

fn extract_working_set(messages: &[MessageRecord], limit: usize) -> Vec<HandoffWorkingSetEntry> {
    let mut recent_entries = Vec::new();
    for message in messages {
        for invocation in &message.tool_invocations {
            let path = extract_invocation_path(&invocation.input);
            if let Some(entry) = to_working_set_entry(
                &invocation.name,
                path.as_deref(),
                message.created_at,
                invocation.output.as_ref(),
            ) {
                recent_entries.push(entry);
            }
        }
    }

    let mut deduped = std::collections::BTreeMap::new();
    for entry in recent_entries {
        deduped.insert(entry.path.clone(), entry);
    }
    let mut entries = deduped.into_values().collect::<Vec<_>>();
    entries.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    entries.truncate(limit);
    entries
}

fn extract_decision_summaries(messages: &[MessageRecord], limit: usize) -> Vec<String> {
    let mut summaries = Vec::new();
    for message in messages {
        for step in message.process_steps.as_deref().unwrap_or(&[]) {
            if let MessageProcessStep::Decision {
                summary, response, ..
            } = step
            {
                let reason = response
                    .as_ref()
                    .map(|record| record.reason.as_str())
                    .map(str::trim)
                    .filter(|value| !value.is_empty());
                let mut parts = vec![summary.trim().to_string()];
                if let Some(reason) = reason {
                    parts.push(format!("Reason: {reason}"));
                }
                let composed = parts.join(" ");
                summaries.push(composed);
            }
        }
    }
    let keep = summaries.len().saturating_sub(limit);
    summaries.into_iter().skip(keep).collect()
}

fn extract_known_error_fingerprints(messages: &[MessageRecord]) -> Vec<String> {
    let mut errors = Vec::new();
    for message in messages {
        for invocation in &message.tool_invocations {
            if let Some(error_text) = invocation.error_text.as_deref() {
                let trimmed = error_text.trim();
                if !trimmed.is_empty() {
                    errors.push(format!("{}: {}", invocation.name, trimmed));
                }
            }
        }
    }
    unique_strings(errors).into_iter().rev().take(6).collect::<Vec<_>>().into_iter().rev().collect()
}

fn extract_invocation_path(input: &Value) -> Option<String> {
    let input = input.as_object()?;
    ["path", "target_directory", "absolute_path"]
        .into_iter()
        .find_map(|key| input.get(key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn to_working_set_entry(
    tool_name: &str,
    path: Option<&str>,
    created_at: u64,
    output: Option<&Value>,
) -> Option<HandoffWorkingSetEntry> {
    let normalized_tool = tool_name.trim();
    if normalized_tool.is_empty() {
        return None;
    }
    let operation_type = resolve_working_set_operation_type(normalized_tool)?;
    let effective_path = path
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("[{normalized_tool}]"));
    Some(HandoffWorkingSetEntry {
        path: effective_path,
        operation_type: operation_type.to_string(),
        last_operation: chrono::DateTime::from_timestamp_millis(created_at as i64)
            .map(|timestamp| timestamp.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
            .unwrap_or_else(|| "1970-01-01T00:00:00.000Z".to_string()),
        created_at,
        needs_verification: None,
        last_known_hash: extract_invocation_sha(output),
    })
}

fn resolve_working_set_operation_type(tool_name: &str) -> Option<&'static str> {
    match tool_name {
        "read_file" => Some("read"),
        "create_file" | "write_file" => Some("write"),
        "edit_file" => Some("edit"),
        "replace_file" | "replace_lines" => Some("replace"),
        "glob" | "grep" => Some("search"),
        _ => None,
    }
}

fn extract_invocation_sha(output: Option<&Value>) -> Option<String> {
    let output = output?.as_object()?;
    let data = output
        .get("data")
        .and_then(Value::as_object)
        .unwrap_or(output);
    data.get("sha256")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn unique_strings(values: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::BTreeSet::new();
    let mut unique = Vec::new();
    for value in values {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            continue;
        }
        if seen.insert(trimmed.clone()) {
            unique.push(trimmed);
        }
    }
    unique
}

fn collect_verification_snapshot(messages: &[MessageRecord]) -> Option<VerificationSnapshot> {
    let shell_invocations = messages.iter().flat_map(|message| {
        message
            .tool_invocations
            .iter()
            .filter(|invocation| invocation.name == "shell" || invocation.name == "remote_shell")
            .map(move |invocation| (message.created_at, invocation))
    });

    let mut snapshot = VerificationSnapshot {
        last_test_command: None,
        last_test_exit_code: None,
        last_build_command: None,
        last_build_exit_code: None,
        failing_command_snippet: None,
    };

    for (_created_at, invocation) in shell_invocations {
        let command = invocation
            .input
            .get("command")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let Some(command) = command else {
            continue;
        };
        let lower = command.to_ascii_lowercase();
        let output = invocation.output.as_ref().and_then(Value::as_object);
        let data = output
            .and_then(|value| value.get("data"))
            .and_then(Value::as_object)
            .or(output);
        let exit_code = data
            .and_then(|value| value.get("exitCode"))
            .and_then(Value::as_i64)
            .map(|value| value as i32);
        let failure_snippet = data
            .and_then(|value| {
                value
                    .get("stderr")
                    .and_then(Value::as_str)
                    .or_else(|| value.get("stdout").and_then(Value::as_str))
            })
            .map(|text| text.chars().take(600).collect::<String>());

        if looks_like_test_command(&lower) {
            snapshot.last_test_command = Some(command.to_string());
            snapshot.last_test_exit_code = exit_code;
            if exit_code.unwrap_or_default() != 0 {
                snapshot.failing_command_snippet = failure_snippet.clone();
            }
        } else if looks_like_build_command(&lower) {
            snapshot.last_build_command = Some(command.to_string());
            snapshot.last_build_exit_code = exit_code;
            if exit_code.unwrap_or_default() != 0 {
                snapshot.failing_command_snippet = failure_snippet.clone();
            }
        }
    }

    if snapshot.last_test_command.is_none()
        && snapshot.last_build_command.is_none()
        && snapshot.failing_command_snippet.is_none()
    {
        None
    } else {
        Some(snapshot)
    }
}

fn collect_background_job_snapshot(app_state: &AppState, task_id: &str) -> Vec<BackgroundJobSnapshot> {
    shell_list(&app_state.shell_registry, Some(crate::tools::shell::ShellStatusFilter::All))
        .unwrap_or_default()
        .into_iter()
        .filter(|shell| shell.task_id.as_deref() == Some(task_id))
        .map(|shell| BackgroundJobSnapshot {
            shell_id: shell.shell_id,
            command: shell.command,
            working_directory: shell.working_directory,
            status: match shell.status {
                ShellStatus::Running => "running",
                ShellStatus::Completed => "completed",
                ShellStatus::Failed => "failed",
                ShellStatus::Timeout => "timeout",
                ShellStatus::Cancelled => "cancelled",
            }
            .to_string(),
            exit_code: shell.exit_code,
            last_output: extract_last_output_line(&shell.stdout, &shell.stderr),
        })
        .collect()
}

fn extract_last_output_line(stdout: &str, stderr: &str) -> Option<String> {
    [stderr, stdout]
        .into_iter()
        .flat_map(|text| text.split('\n'))
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .last()
        .map(str::to_string)
}

fn looks_like_test_command(command: &str) -> bool {
    ["test", "vitest", "jest", "cargo test", "pytest", "playwright"]
        .iter()
        .any(|pattern| command.contains(pattern))
}

fn looks_like_build_command(command: &str) -> bool {
    ["build", "tsc", "cargo build", "vite build", "next build"]
        .iter()
        .any(|pattern| command.contains(pattern))
}

fn emit_event(
    registry: &Arc<Mutex<super::registry::AgentRegistry>>,
    broadcaster: &Arc<SseBroadcaster>,
    task_id: &str,
    event: AgentEvent,
) -> Result<u64, AgentLoopError> {
    let json = serde_json::to_string(&event)
        .map_err(|error| AgentLoopError::Other(format!("Failed to serialize event: {error}")))?;
    let seq = {
        let mut registry = registry
            .lock()
            .map_err(|_| AgentLoopError::Other("Agent registry lock poisoned".to_string()))?;
        registry.record_event(task_id, &json)
    };
    broadcaster.emit(task_id, &super::loop_::inject_seq_into_event_json(&json, seq));
    Ok(seq)
}

fn sanitize_inline_value(value: &str) -> String {
    let trimmed = value.trim().replace(char::is_whitespace, " ");
    if trimmed.is_empty() {
        "Unknown".to_string()
    } else {
        trimmed
    }
}

trait IfEmpty {
    fn if_empty(self, fallback: &str) -> String;
}

impl IfEmpty for &str {
    fn if_empty(self, fallback: &str) -> String {
        let trimmed = self.trim();
        if trimmed.is_empty() {
            fallback.to_string()
        } else {
            trimmed.to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::PathBuf};

    #[derive(Debug, Deserialize)]
    struct Fixture {
        name: String,
        input: FixtureInput,
        expected: FixtureExpected,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct FixtureInput {
        source_session_id: String,
        continued_session_id: String,
        source_session_title: String,
        generated_at: String,
        model: String,
        session_kind: String,
        autonomy_mode: String,
        decision_policy_version: String,
        decision_model: Option<String>,
        context_usage: FixtureContextUsage,
        handoff_body: String,
        quality_failures: Option<Vec<String>>,
        supplemental_context: Option<HandoffSupplementalContext>,
        fallback_user_content: String,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct FixtureContextUsage {
        used_tokens: u32,
        max_tokens: u32,
        remaining_tokens: u32,
        reserved_tokens: u32,
        trigger_threshold: f64,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct FixtureExpected {
        handoff_user_prompt: Option<String>,
        verification_checklist: Option<Vec<String>>,
        continuation_title: Option<String>,
        fallback_handoff_body: Option<String>,
        stored_handoff_artifact: Option<String>,
        continuation_prompt: Option<String>,
    }

    fn load_fixtures() -> Vec<Fixture> {
        let fixture_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../testdata/handoff");
        let mut paths = fs::read_dir(&fixture_dir)
            .unwrap_or_else(|error| panic!("failed to read fixture dir {fixture_dir:?}: {error}"))
            .map(|entry| entry.expect("fixture entry").path())
            .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("json"))
            .collect::<Vec<_>>();
        paths.sort();
        paths.into_iter()
            .map(|path| {
                serde_json::from_str::<Fixture>(
                    &fs::read_to_string(&path)
                        .unwrap_or_else(|error| panic!("failed to read {path:?}: {error}")),
                )
                .unwrap_or_else(|error| panic!("failed to parse {path:?}: {error}"))
            })
            .collect()
    }

    fn to_context_usage(input: &FixtureContextUsage) -> AgentContextUsageSnapshot {
        AgentContextUsageSnapshot {
            used_tokens: input.used_tokens,
            max_tokens: input.max_tokens,
            remaining_tokens: input.remaining_tokens,
            reserved_tokens: input.reserved_tokens,
            trigger_threshold: input.trigger_threshold,
        }
    }

    fn build_source_session(input: &FixtureInput) -> SessionRecord {
        SessionRecord {
            id: input.source_session_id.clone(),
            title: input.source_session_title.clone(),
            model: input.model.clone(),
            provider: "openai".to_string(),
            workspace_dir: None,
            session_kind: input.session_kind.clone(),
            autonomy_mode: input.autonomy_mode.clone(),
            decision_policy_version: input.decision_policy_version.clone(),
            decision_model: input.decision_model.clone(),
            parent_session_id: None,
            handoff_from_session_id: None,
            handoff_message_id: None,
            handoff_phase: None,
            plan_file_name: None,
            plan_built_at: None,
            context_usage_snapshot: None,
            pinned_at: None,
            created_at: 0,
            updated_at: 0,
        }
    }

    fn build_continued_session(input: &FixtureInput) -> SessionRecord {
        SessionRecord {
            id: input.continued_session_id.clone(),
            ..build_source_session(input)
        }
    }

    fn build_params(input: &FixtureInput) -> AgentStartParams {
        AgentStartParams {
            task_id: "task-1".to_string(),
            base_url: "http://localhost".to_string(),
            api_key: None,
            api_key_source: "unset".to_string(),
            api_key_env_var: "OPENAI_API_KEY".to_string(),
            model: input.model.clone(),
            messages: Vec::new(),
            tools: None,
            request_extensions: None,
            session_id: Some(input.source_session_id.clone()),
            emit_assistant_output: Some(true),
            max_context_tokens: None,
            handoff_trigger_threshold: None,
            agent_mode: None,
            thinking_enabled: None,
            models: None,
            session_kind: Some(input.session_kind.clone()),
            autonomy_mode: Some(input.autonomy_mode.clone()),
            decision_policy_version: Some(input.decision_policy_version.clone()),
            decision_model: input.decision_model.clone(),
        }
    }

    #[test]
    fn shared_handoff_fixtures_match_backend_helpers() {
        for fixture in load_fixtures() {
            let input = &fixture.input;
            let expected = &fixture.expected;
            let context_usage = to_context_usage(&input.context_usage);
            let supplemental_context = input.supplemental_context.clone().unwrap_or_default();

            if let Some(expected_prompt) = &expected.handoff_user_prompt {
                assert_eq!(
                    build_agent_handoff_user_prompt(
                        &input.source_session_title,
                        &context_usage,
                        &input.session_kind,
                        &input.autonomy_mode,
                        &input.decision_policy_version,
                        input.decision_model.as_deref(),
                        input.quality_failures.as_deref(),
                    ),
                    *expected_prompt,
                    "handoffUserPrompt fixture {}",
                    fixture.name
                );
            }

            let verification_checklist = build_verification_checklist(
                supplemental_context.verification.as_ref(),
                &supplemental_context.working_set,
                &supplemental_context.background_jobs,
            );

            if let Some(expected_checklist) = &expected.verification_checklist {
                assert_eq!(
                    verification_checklist, *expected_checklist,
                    "verificationChecklist fixture {}",
                    fixture.name
                );
            }

            if let Some(expected_title) = &expected.continuation_title {
                assert_eq!(
                    derive_continuation_session_title(&input.source_session_title),
                    *expected_title,
                    "continuationTitle fixture {}",
                    fixture.name
                );
            }

            if let Some(expected_fallback) = &expected.fallback_handoff_body {
                assert_eq!(
                    build_fallback_handoff_body(
                        input.fallback_user_content.clone(),
                        &input.source_session_title,
                    ),
                    *expected_fallback,
                    "fallbackHandoffBody fixture {}",
                    fixture.name
                );
            }

            let source_session = build_source_session(input);
            let continued_session = build_continued_session(input);
            let params = build_params(input);

            if let Some(expected_artifact) = &expected.stored_handoff_artifact {
                assert_eq!(
                    build_stored_handoff_artifact(
                        &source_session,
                        &continued_session,
                        &params,
                        &context_usage,
                        &input.handoff_body,
                        &input.generated_at,
                        &supplemental_context,
                    ),
                    *expected_artifact,
                    "storedHandoffArtifact fixture {}",
                    fixture.name
                );
            }

            if let Some(expected_prompt) = &expected.continuation_prompt {
                let handoff_artifact = expected
                    .stored_handoff_artifact
                    .clone()
                    .expect("continuationPrompt requires storedHandoffArtifact");
                assert_eq!(
                    build_continuation_prompt(
                        &handoff_artifact,
                        &input.source_session_title,
                        &input.session_kind,
                        &input.autonomy_mode,
                        &input.decision_policy_version,
                        &supplemental_context.working_set,
                        &verification_checklist,
                        supplemental_context.tool_archive_index_path.as_deref(),
                        supplemental_context.history_file_path.as_deref(),
                        supplemental_context.chain_manifest_path.as_deref(),
                    ),
                    *expected_prompt,
                    "continuationPrompt fixture {}",
                    fixture.name
                );
            }
        }
    }
}
