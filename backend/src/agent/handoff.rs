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

#[derive(Debug, Clone)]
struct VerificationSnapshot {
    last_test_command: Option<String>,
    last_test_exit_code: Option<i32>,
    last_build_command: Option<String>,
    last_build_exit_code: Option<i32>,
    failing_command_snippet: Option<String>,
}

#[derive(Debug, Clone)]
struct BackgroundJobSnapshot {
    shell_id: String,
    command: String,
    working_directory: String,
    status: String,
    exit_code: Option<i32>,
    last_output: Option<String>,
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

    let handoff_body = generate_handoff_body(params, current_messages, context_usage)
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
    let handoff_artifact = build_stored_handoff_artifact(
        &source_session,
        &continued_session,
        params,
        context_usage,
        &handoff_body,
        verification.as_ref(),
        git_snapshot.as_ref(),
        &background_jobs,
    );
    let continuation_prompt = build_continuation_prompt(
        &handoff_artifact,
        &source_session.title,
        &source_session.session_kind,
        &source_session.autonomy_mode,
        &source_session.decision_policy_version,
        verification.as_ref(),
        &background_jobs,
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
            context_usage,
            params.session_kind.as_deref().unwrap_or("standard"),
            params.autonomy_mode.as_deref().unwrap_or("interactive"),
            params
                .decision_policy_version
                .as_deref()
                .unwrap_or("mvp-v1"),
            params.decision_model.as_deref(),
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
    context_usage: &AgentContextUsageSnapshot,
    session_kind: &str,
    autonomy_mode: &str,
    decision_policy_version: &str,
    decision_model: Option<&str>,
) -> String {
    [
        "Create a handoff document for a fresh session that has no memory of the previous conversation.",
        "The next session should trust the working set and archived tool outputs, continuing immediately with minimal verification.",
        "",
        "Current rollover context:",
        &format!("- sessionKind: {session_kind}"),
        &format!("- autonomyMode: {autonomy_mode}"),
        &format!("- decisionPolicyVersion: {decision_policy_version}"),
        &format!("- decisionModel: {}", decision_model.unwrap_or("default")),
        &format!("- usedTokens: {}", context_usage.used_tokens),
        &format!("- maxTokens: {}", context_usage.max_tokens),
        &format!("- remainingTokens: {}", context_usage.remaining_tokens),
        &format!("- reservedTokens: {}", context_usage.reserved_tokens),
        &format!("- triggerThreshold: {}", context_usage.trigger_threshold),
    ]
    .join("\n")
}

fn build_stored_handoff_artifact(
    source_session: &SessionRecord,
    continued_session: &SessionRecord,
    params: &AgentStartParams,
    context_usage: &AgentContextUsageSnapshot,
    handoff_body: &str,
    verification: Option<&VerificationSnapshot>,
    git_snapshot: Option<&crate::tools::GitSnapshotResult>,
    background_jobs: &[BackgroundJobSnapshot],
) -> String {
    let mut body_sections = vec![handoff_body.trim().to_string()];
    if let Some(verification) = verification {
        body_sections.push(format!(
            "## Verification\n```yaml\nlast_test_command: {}\nlast_test_exit_code: {}\nlast_build_command: {}\nlast_build_exit_code: {}\nfailure_snippet: {}\n```",
            yaml_scalar(verification.last_test_command.as_deref()),
            yaml_scalar(verification.last_test_exit_code.map(|value| value.to_string()).as_deref()),
            yaml_scalar(verification.last_build_command.as_deref()),
            yaml_scalar(verification.last_build_exit_code.map(|value| value.to_string()).as_deref()),
            yaml_scalar(verification.failing_command_snippet.as_deref()),
        ));
    }
    if let Some(git_snapshot) = git_snapshot {
        body_sections.push(format!(
            "## Code Delta\n- branch: {}\n\n```text\n[git status --short]\n{}\n\n[git diff --stat]\n{}\n```",
            git_snapshot.branch.as_deref().unwrap_or("Unknown"),
            git_snapshot.status_short,
            git_snapshot.diff_stat,
        ));
    }
    if !background_jobs.is_empty() {
        let mut lines = vec!["## Background Job Snapshot".to_string()];
        for job in background_jobs {
            lines.push(format!(
                "- {}: {} ({}{})",
                job.shell_id,
                job.command,
                job.status,
                job.exit_code
                    .map(|code| format!(", exit {code}"))
                    .unwrap_or_default()
            ));
            if let Some(last_output) = &job.last_output {
                lines.push(format!("  Last output: {last_output}"));
            }
        }
        body_sections.push(lines.join("\n"));
    }

    [
        HANDOFF_ARTIFACT_HEADING.to_string(),
        String::new(),
        format!("- sourceSessionId: {}", source_session.id),
        format!("- continuedSessionId: {}", continued_session.id),
        format!("- sourceSessionTitle: {}", sanitize_inline_value(&source_session.title)),
        format!("- generatedAt: {}", current_timestamp_ms()),
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
        body_sections.join("\n\n").trim().to_string(),
    ]
    .join("\n")
}

fn build_continuation_prompt(
    handoff_artifact: &str,
    source_session_title: &str,
    session_kind: &str,
    autonomy_mode: &str,
    decision_policy_version: &str,
    verification: Option<&VerificationSnapshot>,
    background_jobs: &[BackgroundJobSnapshot],
) -> String {
    let mut lines = vec![
        "A previous session of this task reached its context budget and handed off the work."
            .to_string(),
        "Treat the handoff below as the authoritative working state written by the previous session."
            .to_string(),
        "Default to trusting the handoff, code delta, and persisted evidence.".to_string(),
        "Continue autonomously without waiting for user input whenever a safe, conservative, and reversible next step exists."
            .to_string(),
        "Only stop to ask the user if proceeding is literally impossible without new external information."
            .to_string(),
        String::new(),
        "Rules:".to_string(),
        "1. Execute Pending Next Actions immediately if the verification checklist passes.".to_string(),
        "2. Keep early verification extremely small and focused.".to_string(),
        "3. Prefer persisted evidence over re-reading large swaths of the codebase.".to_string(),
        String::new(),
        format!("Previous session: {}", sanitize_inline_value(source_session_title)),
        format!(
            "Session policy: {} / {} / {}",
            session_kind,
            autonomy_mode,
            sanitize_inline_value(decision_policy_version)
        ),
        String::new(),
        "## Continuation Verification Checklist".to_string(),
    ];
    if let Some(verification) = verification {
        if let Some(command) = verification.last_test_command.as_deref() {
            lines.push(format!(
                "1. Re-run `{command}` and expect exit code {}.",
                verification
                    .last_test_exit_code
                    .map(|code| code.to_string())
                    .unwrap_or_else(|| "Unknown".to_string())
            ));
        }
    }
    if lines.last().map(|value| value.starts_with("1.")).unwrap_or(false) == false {
        lines.push(
            "1. Validate the immediately next file or command only if the handoff evidence looks stale."
                .to_string(),
        );
    }
    if let Some(job) = background_jobs.iter().find(|job| job.status == "running") {
        lines.push(format!(
            "2. Check running shell {} in `{}` before starting duplicate processes.",
            job.shell_id, job.working_directory
        ));
    }
    lines.push(String::new());
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
        "## Artifacts And Evidence".to_string(),
        "- Previous session chat history".to_string(),
        String::new(),
        "## Open Questions".to_string(),
        "- Unknown. If needed, proceed with conservative assumptions and record them.".to_string(),
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

fn yaml_scalar(value: Option<&str>) -> String {
    value
        .map(|value| format!("{value:?}"))
        .unwrap_or_else(|| "null".to_string())
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
