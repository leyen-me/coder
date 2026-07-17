use std::sync::MutexGuard;

use chrono::Local;
use regex::Regex;
use serde::Deserialize;
use serde_json::{json, Value};

use super::types::{AgentToolDefinition, ApiToolCall, ApiToolCallFunction, ChatMessage};
use crate::db::{
    records::{AgentTodoRecord, MessageImageAttachment, MessageProcessStep, MessageRecord, SessionRecord},
    session_store::{get_agent_todos_by_session, get_messages_by_session},
    Database,
};
use crate::tools::{
    agent_get_runtime_environment, resolve_skill_references, McpServerConfig, RuntimeEnvironmentResponse,
};
use crate::AppState;

const PROMPT_BLOCK_SEPARATOR: &str = "\n\n---\n\n";
const TODO_SNAPSHOT_LIMIT: usize = 8;
const BUILD_PROMPT_MARKER: &str = "implement the following plan";

#[derive(Debug, Clone)]
struct HistoricalChatMessage {
    chat: ChatMessage,
    referenced_skills: Vec<String>,
}

#[derive(Debug, Clone)]
struct ResolvedSkillPrompt {
    slug: String,
    content: String,
}

pub fn assemble_agent_messages(
    app_state: &AppState,
    session: &SessionRecord,
    agent_mode: Option<&str>,
) -> Result<Vec<ChatMessage>, String> {
    let workspace_dir = resolve_workspace_dir(app_state, session.workspace_dir.as_deref());
    let runtime = agent_get_runtime_environment(workspace_dir.clone())?;
    let remote_targets = load_enabled_remote_targets(app_state)?;
    let history_records = {
        let db = lock_db(&app_state.db)?;
        get_messages_by_session(&db, &session.id)?
    };
    let todos = {
        let db = lock_db(&app_state.db)?;
        get_agent_todos_by_session(&db, &session.id)?
    };

    let mut conversation = history_records
        .into_iter()
        .flat_map(message_record_to_historical_messages)
        .collect::<Vec<_>>();
    conversation.retain(has_message_payload);
    assert_valid_tool_call_chain(&conversation)?;
    trim_to_build_boundary(&mut conversation);
    apply_referenced_skills_to_conversation(&mut conversation, workspace_dir.as_deref())?;

    let mut result = Vec::new();
    result.push(system_message(build_system_prompt(
        &runtime,
        &remote_targets,
        workspace_dir.as_deref(),
        agent_mode,
    )));

    if let Some(prompt) = build_session_policy_system_prompt(session) {
        result.push(system_message(prompt));
    }
    if let Some(prompt) = build_todo_snapshot_system_message(&todos) {
        result.push(system_message(prompt));
    }

    result.extend(conversation.into_iter().map(|message| message.chat));
    Ok(result)
}

pub fn build_system_prompt_preview(
    app_state: &AppState,
    session: &SessionRecord,
    agent_mode: Option<&str>,
    workspace_dir_override: Option<&str>,
) -> Result<String, String> {
    let mut effective_session = session.clone();
    if let Some(workspace_dir) = workspace_dir_override.map(str::trim).filter(|value| !value.is_empty()) {
        effective_session.workspace_dir = Some(workspace_dir.to_string());
    }
    let messages = assemble_agent_messages(app_state, &effective_session, agent_mode)?;
    let system_blocks = messages
        .into_iter()
        .take_while(|message| message.role == "system")
        .filter_map(|message| message.content.and_then(|value| value.as_str().map(str::to_string)))
        .collect::<Vec<_>>();
    Ok(join_prompt_blocks(system_blocks))
}

pub fn session_includes_handoff_tools(session: &SessionRecord) -> bool {
    session
        .handoff_from_session_id
        .as_deref()
        .is_some_and(|id| !id.trim().is_empty())
}

pub async fn resolve_agent_tool_definitions(
    app_state: &AppState,
    agent_mode: Option<&str>,
    include_handoff_tools: bool,
    extra_tools: Option<Vec<AgentToolDefinition>>,
) -> Vec<AgentToolDefinition> {
    let mut definitions =
        super::tool_dispatch::get_tool_definitions(agent_mode, include_handoff_tools);
    definitions.extend(resolve_mcp_agent_tools(app_state).await);
    if let Some(extra) = extra_tools {
        definitions.extend(extra.into_iter().filter(|tool| {
            include_handoff_tools
                || !super::tool_dispatch::is_handoff_only_agent_tool(&tool.function.name)
        }));
    }
    dedupe_tool_definitions(definitions)
}

fn dedupe_tool_definitions(mut tools: Vec<AgentToolDefinition>) -> Vec<AgentToolDefinition> {
    tools.sort_by(|left, right| left.function.name.cmp(&right.function.name));
    tools.dedup_by(|left, right| left.function.name == right.function.name);
    tools
}

async fn resolve_mcp_agent_tools(app_state: &AppState) -> Vec<AgentToolDefinition> {
    let servers = load_enabled_mcp_servers(app_state).unwrap_or_default();
    let mut definitions = Vec::new();

    for server in servers {
        let listed = app_state.mcp_registry.list_tools(server.clone()).await;
        let Ok(result) = listed else {
            continue;
        };
        for tool in result.tools {
            definitions.push(mcp_tool_to_agent_definition(&server, tool));
        }
    }

    definitions
}

fn mcp_tool_to_agent_definition(
    server: &McpServerConfig,
    tool: crate::tools::mcp::McpToolDefinition,
) -> AgentToolDefinition {
    AgentToolDefinition {
        kind: "function".to_string(),
        function: super::types::AgentToolFunction {
            name: format!("mcp__{}__{}", server.id.trim(), tool.name.trim()),
            description: format!(
                "[MCP: {}] {}",
                server.name.trim(),
                tool.description.unwrap_or_else(|| tool.name.clone()).trim()
            ),
            parameters: normalize_mcp_input_schema(tool.input_schema),
        },
    }
}

fn normalize_mcp_input_schema(schema: Value) -> Value {
    let Some(object) = schema.as_object() else {
        return json!({
            "type": "object",
            "properties": {},
            "additionalProperties": true
        });
    };
    if object.get("type").and_then(Value::as_str) != Some("object") {
        return json!({
            "type": "object",
            "properties": {},
            "additionalProperties": true
        });
    }

    let mut properties = serde_json::Map::new();
    if let Some(raw_properties) = object.get("properties").and_then(Value::as_object) {
        for (key, value) in raw_properties {
            let Some(property) = value.as_object() else {
                continue;
            };
            let Some(kind) = property.get("type").and_then(Value::as_str) else {
                continue;
            };
            if !matches!(kind, "string" | "number" | "boolean" | "integer" | "array" | "object") {
                continue;
            }
            let mut normalized = serde_json::Map::new();
            normalized.insert("type".to_string(), Value::String(kind.to_string()));
            if let Some(description) = property.get("description").and_then(Value::as_str) {
                normalized.insert("description".to_string(), Value::String(description.to_string()));
            }
            if let Some(items) = property.get("enum").and_then(Value::as_array) {
                let enum_values = items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(|value| Value::String(value.to_string()))
                    .collect::<Vec<_>>();
                if !enum_values.is_empty() {
                    normalized.insert("enum".to_string(), Value::Array(enum_values));
                }
            }
            properties.insert(key.clone(), Value::Object(normalized));
        }
    }

    json!({
        "type": "object",
        "properties": Value::Object(properties),
        "required": object.get("required").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
        "additionalProperties": object.get("additionalProperties").and_then(Value::as_bool).unwrap_or(true)
    })
}

fn resolve_workspace_dir(app_state: &AppState, requested: Option<&str>) -> Option<String> {
    requested
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| {
            let fallback = app_state.workspace_dir.to_string_lossy().trim().to_string();
            (!fallback.is_empty()).then_some(fallback)
        })
}

fn lock_db<'a>(db: &'a std::sync::Arc<std::sync::Mutex<Database>>) -> Result<MutexGuard<'a, Database>, String> {
    db.lock().map_err(|_| "Database lock poisoned".to_string())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteTargetRecord {
    alias: String,
    host: String,
    port: u16,
    user: String,
    enabled: bool,
}

fn load_enabled_remote_targets(app_state: &AppState) -> Result<Vec<RemoteTargetRecord>, String> {
    let db = lock_db(&app_state.db)?;
    let mut targets = db.get_all::<RemoteTargetRecord>("remoteTargets")?;
    targets.retain(|target| target.enabled);
    targets.sort_by(|left, right| left.alias.cmp(&right.alias));
    Ok(targets)
}

fn load_enabled_mcp_servers(app_state: &AppState) -> Result<Vec<McpServerConfig>, String> {
    let db = lock_db(&app_state.db)?;
    let mut servers = db.get_all::<McpServerConfig>("mcpServers")?;
    servers.retain(|server| server.enabled);
    servers.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(servers)
}

fn message_record_to_historical_messages(message: MessageRecord) -> Vec<HistoricalChatMessage> {
    if message.role == "user" {
        return vec![HistoricalChatMessage {
            chat: ChatMessage {
                role: "user".to_string(),
                content: Some(build_user_message_content(&message.content, message.images.as_deref().unwrap_or(&[]))),
                reasoning_content: None,
                tool_calls: None,
                tool_call_id: None,
                name: None,
            },
            referenced_skills: message.referenced_skills.unwrap_or_default(),
        }];
    }

    let tool_invocations = message.tool_invocations.clone();
    let include_reasoning = !tool_invocations.is_empty();
    let can_use_process_steps = process_steps_include_all_tools(message.process_steps.as_deref(), &tool_invocations);
    if can_use_process_steps {
        if let Some(messages) =
            build_agent_messages_from_process_steps(message.process_steps.as_deref(), &tool_invocations, include_reasoning)
        {
            return messages
                .into_iter()
                .map(|chat| HistoricalChatMessage {
                    chat,
                    referenced_skills: Vec::new(),
                })
                .collect();
        }
    }

    build_legacy_assistant_messages(&message, include_reasoning)
        .into_iter()
        .map(|chat| HistoricalChatMessage {
            chat,
            referenced_skills: Vec::new(),
        })
        .collect()
}

fn build_user_message_content(text: &str, images: &[MessageImageAttachment]) -> Value {
    let trimmed = text.trim();
    let valid_images = images
        .iter()
        .filter(|image| !image.url.trim().is_empty())
        .collect::<Vec<_>>();
    if valid_images.is_empty() {
        return Value::String(trimmed.to_string());
    }

    let mut parts = Vec::new();
    if !trimmed.is_empty() {
        parts.push(json!({
            "type": "text",
            "text": trimmed
        }));
    }
    for image in valid_images {
        parts.push(json!({
            "type": "image_url",
            "image_url": {
                "url": image.url,
                "detail": "auto"
            }
        }));
    }
    Value::Array(parts)
}

fn has_message_payload(message: &HistoricalChatMessage) -> bool {
    match message.chat.role.as_str() {
        "assistant" => {
            let text = message.chat.content.as_ref().and_then(Value::as_str).unwrap_or("");
            !text.trim().is_empty()
                || message
                    .chat
                    .reasoning_content
                    .as_deref()
                    .is_some_and(|value| !value.trim().is_empty())
                || message.chat.tool_calls.as_ref().is_some_and(|calls| !calls.is_empty())
        }
        "tool" => message
            .chat
            .tool_call_id
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty()),
        _ => has_agent_message_content(message.chat.content.as_ref()),
    }
}

fn has_agent_message_content(content: Option<&Value>) -> bool {
    match content {
        None => false,
        Some(Value::String(value)) => !value.trim().is_empty(),
        Some(Value::Array(items)) => !items.is_empty(),
        Some(_) => true,
    }
}

fn trim_to_build_boundary(messages: &mut Vec<HistoricalChatMessage>) {
    let mut boundary = None;
    for index in (0..messages.len()).rev() {
        let message = &messages[index];
        if message.chat.role == "user"
            && message
                .chat
                .content
                .as_ref()
                .and_then(Value::as_str)
                .is_some_and(|content| content.contains(BUILD_PROMPT_MARKER))
        {
            boundary = Some(index);
            break;
        }
    }

    if let Some(index) = boundary {
        if index > 0 {
            messages.drain(0..index);
        }
    }
}

fn apply_referenced_skills_to_conversation(
    messages: &mut [HistoricalChatMessage],
    workspace_dir: Option<&str>,
) -> Result<(), String> {
    for message in messages.iter_mut() {
        if message.chat.role != "user" {
            continue;
        }
        let Some(content) = message.chat.content.as_ref().and_then(Value::as_str) else {
            continue;
        };
        // Only inject skills that were explicitly referenced (editor chips).
        // Plain-text "/xxx" must remain ordinary user text for the LLM.
        let slugs = message.referenced_skills.clone();
        if slugs.is_empty() {
            continue;
        }

        let resolved = resolve_skill_references(workspace_dir, &slugs)?;
        if resolved.skills.is_empty() {
            continue;
        }

        let injected = inject_referenced_skills_into_user_content(
            content,
            &resolved
                .skills
                .into_iter()
                .map(|skill| ResolvedSkillPrompt {
                    slug: skill.summary.slug,
                    content: skill.content,
                })
                .collect::<Vec<_>>(),
        );
        message.chat.content = Some(Value::String(injected));
    }
    Ok(())
}

fn inject_referenced_skills_into_user_content(content: &str, skills: &[ResolvedSkillPrompt]) -> String {
    if skills.is_empty() {
        return content.to_string();
    }
    let mut blocks = skills
        .iter()
        .map(|skill| build_titled_prompt_block(&format!("Referenced skill: {}", skill.slug), &[skill.content.trim().to_string()]))
        .collect::<Vec<_>>();
    blocks.push(content.to_string());
    join_prompt_blocks(blocks)
}

fn assert_valid_tool_call_chain(messages: &[HistoricalChatMessage]) -> Result<(), String> {
    for index in 0..messages.len() {
        let message = &messages[index];
        let Some(tool_calls) = message.chat.tool_calls.as_ref() else {
            continue;
        };
        if message.chat.role != "assistant" || tool_calls.is_empty() {
            continue;
        }

        let mut expected = tool_calls
            .iter()
            .map(|call| call.id.clone())
            .collect::<Vec<_>>();
        let mut cursor = index + 1;
        while !expected.is_empty() && cursor < messages.len() {
            let next = &messages[cursor];
            if next.chat.role != "tool" {
                break;
            }
            if let Some(tool_call_id) = next.chat.tool_call_id.as_deref() {
                expected.retain(|candidate| candidate != tool_call_id);
            }
            cursor += 1;
        }
        if !expected.is_empty() {
            return Err(
                "Invalid agent history: assistant tool_calls are missing matching tool responses.".to_string(),
            );
        }
    }
    Ok(())
}

fn process_steps_include_all_tools(
    process_steps: Option<&[MessageProcessStep]>,
    tool_invocations: &[crate::db::records::MessageToolInvocation],
) -> bool {
    if tool_invocations.is_empty() {
        return true;
    }
    let tool_ids = process_steps
        .unwrap_or(&[])
        .iter()
        .filter_map(|step| match step {
            MessageProcessStep::Tool { tool_call_id, .. } => Some(tool_call_id.clone()),
            _ => None,
        })
        .collect::<Vec<_>>();
    tool_invocations.iter().all(|invocation| tool_ids.iter().any(|id| id == &invocation.id))
}

fn build_agent_messages_from_process_steps(
    process_steps: Option<&[MessageProcessStep]>,
    tool_invocations: &[crate::db::records::MessageToolInvocation],
    include_reasoning: bool,
) -> Option<Vec<ChatMessage>> {
    let steps = process_steps.unwrap_or(&[]);
    if steps.is_empty() {
        return None;
    }
    let mut messages = Vec::new();
    let mut reasoning = String::new();
    let mut content = String::new();

    let flush_segment = |messages: &mut Vec<ChatMessage>,
                         reasoning: &mut String,
                         content: &mut String,
                         tool_call_id: Option<&str>| {
        let trimmed_reasoning = reasoning.trim().to_string();
        let trimmed_content = content.trim().to_string();
        let invocation = tool_call_id.and_then(|id| tool_invocations.iter().find(|item| item.id == id));
        if trimmed_reasoning.is_empty() && trimmed_content.is_empty() && invocation.is_none() {
            return;
        }
        let mut assistant = ChatMessage {
            role: "assistant".to_string(),
            content: None,
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: None,
            name: None,
        };
        if !trimmed_content.is_empty() {
            assistant.content = Some(Value::String(trimmed_content));
        }
        if include_reasoning && !trimmed_reasoning.is_empty() {
            assistant.reasoning_content = Some(trimmed_reasoning);
        }
        if let Some(invocation) = invocation {
            assistant.tool_calls = Some(vec![to_api_tool_call(invocation)]);
        }
        if assistant.content.is_some() || assistant.tool_calls.as_ref().is_some_and(|calls| !calls.is_empty()) {
            messages.push(assistant);
        }
        reasoning.clear();
        content.clear();
    };

    for step in steps {
        match step {
            MessageProcessStep::Reasoning { text, .. } => reasoning.push_str(text),
            MessageProcessStep::Answer { text, .. } => content.push_str(text),
            MessageProcessStep::Tool { tool_call_id, .. } => {
                flush_segment(&mut messages, &mut reasoning, &mut content, Some(tool_call_id));
                if let Some(invocation) = tool_invocations.iter().find(|item| item.id == *tool_call_id) {
                    messages.push(ChatMessage {
                        role: "tool".to_string(),
                        content: Some(Value::String(serialize_invocation_tool_content(invocation))),
                        reasoning_content: None,
                        tool_calls: None,
                        tool_call_id: Some(invocation.id.clone()),
                        name: Some(invocation.name.clone()),
                    });
                }
            }
            MessageProcessStep::Decision { .. } => {}
        }
    }
    flush_segment(&mut messages, &mut reasoning, &mut content, None);

    if messages.is_empty() && include_reasoning && !reasoning.trim().is_empty() {
        return Some(vec![ChatMessage {
            role: "assistant".to_string(),
            content: Some(Value::String(reasoning.trim().to_string())),
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: None,
            name: None,
        }]);
    }

    (!messages.is_empty()).then_some(messages)
}

fn build_legacy_assistant_messages(message: &MessageRecord, include_reasoning: bool) -> Vec<ChatMessage> {
    let mut assistant = ChatMessage {
        role: "assistant".to_string(),
        content: None,
        reasoning_content: None,
        tool_calls: None,
        tool_call_id: None,
        name: None,
    };
    let content = message.content.trim();
    let thinking = message.thinking.trim();

    if !content.is_empty() {
        assistant.content = Some(Value::String(content.to_string()));
    }
    if include_reasoning && !thinking.is_empty() {
        assistant.reasoning_content = Some(thinking.to_string());
    }
    if !message.tool_invocations.is_empty() {
        assistant.tool_calls = Some(message.tool_invocations.iter().map(to_api_tool_call).collect());
    }
    if assistant.content.is_none() && assistant.tool_calls.as_ref().is_none_or(|calls| calls.is_empty()) {
        return Vec::new();
    }

    let mut result = vec![assistant];
    result.extend(message.tool_invocations.iter().map(|invocation| ChatMessage {
        role: "tool".to_string(),
        content: Some(Value::String(serialize_invocation_tool_content(invocation))),
        reasoning_content: None,
        tool_calls: None,
        tool_call_id: Some(invocation.id.clone()),
        name: Some(invocation.name.clone()),
    }));
    result
}

fn to_api_tool_call(invocation: &crate::db::records::MessageToolInvocation) -> ApiToolCall {
    ApiToolCall {
        id: invocation.id.clone(),
        kind: "function".to_string(),
        function: ApiToolCallFunction {
            name: invocation.name.clone(),
            arguments: serde_json::to_string(&invocation.input).unwrap_or_else(|_| "{}".to_string()),
        },
    }
}

fn serialize_invocation_tool_content(invocation: &crate::db::records::MessageToolInvocation) -> String {
    if let Some(output) = invocation.output.clone() {
        return serde_json::to_string(&output).unwrap_or_else(|_| "null".to_string());
    }
    if let Some(error_text) = invocation.error_text.as_deref().filter(|value| !value.trim().is_empty()) {
        return json!({
            "ok": false,
            "tool": invocation.name,
            "error": {
                "code": "tool_error",
                "message": error_text
            }
        })
        .to_string();
    }
    json!({
        "ok": false,
        "tool": invocation.name,
        "error": {
            "code": "missing_output",
            "message": "Tool result was not persisted."
        }
    })
    .to_string()
}

fn system_message(content: String) -> ChatMessage {
    ChatMessage {
        role: "system".to_string(),
        content: Some(Value::String(content)),
        reasoning_content: None,
        tool_calls: None,
        tool_call_id: None,
        name: None,
    }
}

fn build_session_policy_system_prompt(session: &SessionRecord) -> Option<String> {
    let is_long_task = session.session_kind == "long_task" || session.autonomy_mode == "unattended";
    if !is_long_task {
        return None;
    }
    Some(
        [
            "## Session execution policy",
            &format!("- sessionKind: {}", session.session_kind),
            &format!("- autonomyMode: {}", session.autonomy_mode),
            &format!("- decisionPolicyVersion: {}", session.decision_policy_version),
            &format!("- decisionModel: {}", session.decision_model.as_deref().unwrap_or("default")),
            "- This is a long-running unattended task session.",
            "- Work autonomously until the task is genuinely complete.",
            "- When your latest reply would normally hand control back to the user, a proxy agent will decide whether the task is complete or provide the next user-style continuation input.",
            "- Do not stop for low-risk follow-up questions when you can continue making progress yourself.",
        ]
        .join("\n"),
    )
}

fn build_todo_snapshot_system_message(todos: &[AgentTodoRecord]) -> Option<String> {
    let active = todos
        .iter()
        .filter(|todo| todo.status == "pending" || todo.status == "in_progress")
        .collect::<Vec<_>>();
    if active.is_empty() {
        return None;
    }
    let visible = active.iter().take(TODO_SNAPSHOT_LIMIT).collect::<Vec<_>>();
    let hidden = active.len().saturating_sub(visible.len());
    let mut lines = vec![
        "## Current session todo state".to_string(),
        "Persisted active todos for this chat session.".to_string(),
        "Completed or cancelled todos are omitted to save tokens.".to_string(),
        "Use todo_read if you need the full list before updating with todo_write.".to_string(),
        String::new(),
    ];
    for todo in visible {
        lines.push(format!("- [{}] {}: {}", todo.status, todo.id, todo.content));
    }
    if hidden > 0 {
        lines.push(format!(
            "- ... {} more active todos omitted; call todo_read for full state.",
            hidden
        ));
    }
    Some(lines.join("\n"))
}

fn build_system_prompt(
    runtime: &RuntimeEnvironmentResponse,
    remote_targets: &[RemoteTargetRecord],
    workspace_dir: Option<&str>,
    agent_mode: Option<&str>,
) -> String {
    let mut blocks = vec![
        build_identity_and_environment_section(runtime, workspace_dir, agent_mode),
        build_core_rules_section().join("\n"),
    ];
    blocks.extend(build_system_module_sections());
    blocks.push(build_skill_catalog_section(runtime, agent_mode).join("\n"));

    let project_instructions = build_project_instructions_section(runtime);
    if !project_instructions.is_empty() {
        blocks.push(project_instructions.join("\n"));
    }
    let remote_section = build_remote_targets_section(remote_targets);
    if !remote_section.is_empty() {
        blocks.push(remote_section.join("\n"));
    }
    let mode_guidance = build_mode_guidance_section(agent_mode, workspace_dir);
    if !mode_guidance.is_empty() {
        blocks.push(mode_guidance.join("\n"));
    }

    join_prompt_blocks(blocks)
}

fn build_identity_and_environment_section(
    runtime: &RuntimeEnvironmentResponse,
    workspace_dir: Option<&str>,
    agent_mode: Option<&str>,
) -> String {
    let workspace_line = workspace_dir.unwrap_or("not selected");
    let git_line = if runtime.is_git_repository {
        "yes"
    } else if workspace_dir.is_some() {
        "no"
    } else {
        "unknown"
    };
    let mode_line = match agent_mode.unwrap_or("agent") {
        "ask" => "ask (read-only: can read files, search code, browse the web, and ask structured clarification questions - cannot modify files or run shell commands)",
        "plan" => "plan (planning: can read files, search, browse, manage .plan/ files and todos - cannot modify project files or run shell commands)",
        _ => "agent (implementation: full file, shell, and workspace tool access — plan file tools are Plan-mode only)",
    };

    [
        "You are Coder, a desktop coding agent.",
        "Use the environment, built-in prompt modules, available skill catalog, and project instructions below as your operating context.",
        "",
        "## Environment",
        "",
        &format!("- workspaceDir: {}", workspace_line),
        &format!("- os: {}", runtime.os.trim()),
        &format!("- shell: {}", runtime.shell.trim()),
        &format!("- gitRepository: {}", git_line),
        &format!("- date: {}", format_today()),
        &format!("- mode: {}", mode_line),
    ]
    .join("\n")
}

fn build_core_rules_section() -> Vec<String> {
    vec![
        "## Communication Rules".to_string(),
        String::new(),
        "1. Reply in the same language the user uses. Be concise, accurate, and direct.".to_string(),
        "2. The user holds final decision authority. Use read, search, and other read-only tools freely when they improve your answer. Do not edit files, run mutating commands, or implement changes until the user has clearly asked for them.".to_string(),
        "3. Lead with the answer or result. Mention process details only when they help the user make a decision or understand risk.".to_string(),
        "4. When the user is exploring or has not chosen an approach, present analysis and options - do not implement on their behalf.".to_string(),
        "5. Once the user has asked for implementation, proceed with safe, conventional defaults and existing project patterns for tactical details. Reserve questions for direction-level choices - scope, architecture, or costly-to-reverse trade-offs - or when genuinely blocked with no safe default.".to_string(),
    ]
}

fn build_system_module_sections() -> Vec<String> {
    vec![
        format!("## Agent Operating Principles\n\n{}", strip_leading_markdown_h1(OPERATING_PRINCIPLES_CONTENT)),
        format!("## Context and Evidence\n\n{}", strip_leading_markdown_h1(CONTEXT_AND_EVIDENCE_CONTENT)),
        format!("## Tool Usage\n\n{}", strip_leading_markdown_h1(TOOL_USAGE_CONTENT)),
        format!("## Communication\n\n{}", strip_leading_markdown_h1(COMMUNICATION_CONTENT)),
        format!("## Code Navigation\n\n{}", strip_leading_markdown_h1(CODE_NAVIGATION_CONTENT)),
        format!("## Code Modification\n\n{}", strip_leading_markdown_h1(CODE_MODIFICATION_CONTENT)),
        format!("## Task Planning\n\n{}", strip_leading_markdown_h1(TASK_PLANNING_CONTENT)),
        format!("## Verification\n\n{}", strip_leading_markdown_h1(VERIFICATION_CONTENT)),
        format!("## Git Workflow\n\n{}", strip_leading_markdown_h1(GIT_WORKFLOW_CONTENT)),
        format!("## Code Review Workflow\n\n{}", strip_leading_markdown_h1(CODE_REVIEW_CONTENT)),
    ]
}

fn build_skill_catalog_section(runtime: &RuntimeEnvironmentResponse, agent_mode: Option<&str>) -> Vec<String> {
    let can_write_skills = !matches!(agent_mode, Some("ask") | Some("plan"));
    let mut lines = vec![
        "## Skill Catalog".to_string(),
        String::new(),
        "Skills use the standard file-system `SKILL.md` format. Only metadata is listed here by default; read a skill file only when it is relevant.".to_string(),
        format!("- User skills root: {}", runtime.skill_roots.user),
        format!(
            "- Workspace skills root: {}",
            runtime.skill_roots.workspace.clone().unwrap_or_else(|| "unavailable".to_string())
        ),
        "- Use the listed skill file path with `read_file` when the task clearly matches a skill or the user explicitly references `/slug`.".to_string(),
        "- A user `/slug` reference is an explicit request to load that skill before following it.".to_string(),
    ];
    if can_write_skills {
        lines.push("- Create or update reusable skills by editing files under the user skills root or workspace skills root.".to_string());
    }
    if runtime.available_skills.is_empty() {
        lines.push(String::new());
        lines.push("No skills were discovered for the current environment.".to_string());
        return lines;
    }

    lines.push(String::new());
    lines.push("### Available skills".to_string());
    lines.push(String::new());
    for skill in &runtime.available_skills {
        lines.push(format!(
            "- /{} | {} | {:?} | {}",
            skill.slug, skill.name, skill.source, skill.path
        ));
        lines.push(format!("  {}", compact_description(&skill.description)));
    }
    lines
}

fn build_project_instructions_section(runtime: &RuntimeEnvironmentResponse) -> Vec<String> {
    let Some(agents_md) = runtime.agents_md.as_ref() else {
        return Vec::new();
    };
    if agents_md.content.trim().is_empty() {
        return Vec::new();
    }
    let mut lines = vec![
        "## Project instructions (AGENTS.md)".to_string(),
        String::new(),
        "Follow these project-specific rules when they do not conflict with the user's current message.".to_string(),
        agents_md.content.trim_end().to_string(),
    ];
    if agents_md.truncated {
        lines.push(String::new());
        lines.push(format!(
            "Note: {} was truncated to 32 KB. Use read_file on {} to read the full file if needed.",
            agents_md.path, agents_md.path
        ));
    }
    lines
}

fn build_remote_targets_section(remote_targets: &[RemoteTargetRecord]) -> Vec<String> {
    if remote_targets.is_empty() {
        return Vec::new();
    }
    let mut lines = vec![
        "## Remote Machines".to_string(),
        String::new(),
        "You have the following remote machines available:".to_string(),
    ];
    for target in remote_targets {
        lines.push(format!("  - \"{}\" ({}@{}:{})", target.alias, target.user, target.host, target.port));
    }
    lines.push(String::new());
    lines.push("Use `remote_shell(target: \"<alias>\", command: \"...\")` to execute commands on a remote machine. Set block_until_ms to 0 to run in background and use await to poll, or omit for default 30s timeout. Supports kill_shell and read_shell_logs for background shells. To run commands on the local machine, use the regular `shell` tool instead.".to_string());
    lines
}

fn build_mode_guidance_section(agent_mode: Option<&str>, workspace_dir: Option<&str>) -> Vec<String> {
    match agent_mode.unwrap_or("agent") {
        "ask" => vec![
            "## Mode Guidance".to_string(),
            String::new(),
            "You are in Ask mode - stay read-only.".to_string(),
            "- You may read files, search code, and browse.".to_string(),
            "- Do not modify files, run shell commands, or perform write operations.".to_string(),
            "- Use ask_question when key requirements or trade-offs are unclear; prefer one batched call over many small rounds.".to_string(),
            "- If the task needs write access, say so clearly and tell the user to switch to Agent mode instead of silently refusing.".to_string(),
            "- Use Mermaid diagrams (graph, sequenceDiagram, classDiagram, stateDiagram-v2, gantt, pie) to visually explain architectures, workflows, processes, and data flows when the topic benefits from visualization.".to_string(),
        ],
        "plan" => {
            let mut lines = vec![
                "## Mode Guidance".to_string(),
                String::new(),
                "You are in Plan mode - research, analyze, and write a structured Markdown plan to the .plan/ directory.".to_string(),
                "The plan file is the source of truth and is shown in the plan sheet above the message composer.".to_string(),
                String::new(),
                "### Plan file workflow".to_string(),
                String::new(),
                "- Check existing plans with plan_list and plan_read before creating or revising one.".to_string(),
                "- Use plan_create for a new plan, plan_edit for targeted updates, and plan_update for major rewrites.".to_string(),
                "- Update the current plan instead of creating duplicates.".to_string(),
                "- Use plan_delete only when the user explicitly asks to remove an obsolete plan.".to_string(),
                String::new(),
                "### Chat reply".to_string(),
                String::new(),
                "- Briefly summarize which plan file was created or updated. Do NOT paste the full plan in chat.".to_string(),
                "- Do NOT include greetings, process narration, tool-call commentary, or closing questions.".to_string(),
                String::new(),
                "### Execution".to_string(),
                String::new(),
                "- When the user asks to implement, tell them to click \"Build\" (执行) in the plan sheet above the composer to run the plan in Agent mode.".to_string(),
                "- Do NOT silently attempt implementation.".to_string(),
            ];
            if workspace_dir.is_none() {
                lines.push(String::new());
                lines.push("### Workspace required".to_string());
                lines.push(String::new());
                lines.push("- plan_create/plan_update/plan_edit require a selected workspace. Ask the user to select one if plan file tools fail.".to_string());
            }
            lines
        }
        _ => Vec::new(),
    }
}

fn format_today() -> String {
    Local::now()
        .format("%A, %m/%d/%Y, UTC%:z")
        .to_string()
}

fn build_titled_prompt_block(title: &str, body_lines: &[String]) -> String {
    let mut lines = vec![format!("## {}", title), String::new()];
    lines.extend(body_lines.iter().cloned());
    lines.join("\n").trim().to_string()
}

fn join_prompt_blocks(blocks: Vec<String>) -> String {
    blocks
        .into_iter()
        .map(|block| block.trim().to_string())
        .filter(|block| !block.is_empty())
        .collect::<Vec<_>>()
        .join(PROMPT_BLOCK_SEPARATOR)
}

fn strip_leading_markdown_h1(content: &str) -> String {
    Regex::new(r"^#\s+[^\n]+\n+")
        .expect("valid h1 regex")
        .replace(content.trim(), "")
        .trim()
        .to_string()
}

fn compact_description(description: &str) -> String {
    let normalized = description.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.chars().count() <= 220 {
        normalized
    } else {
        format!(
            "{}...",
            normalized.chars().take(217).collect::<String>()
        )
    }
}

const OPERATING_PRINCIPLES_CONTENT: &str = r#"# Agent Operating Principles

Your job is to understand the user's intent, make correct changes, verify the result, and communicate accurate conclusions.

### Core rules

- Follow the user's request. Do not expand scope without a clear reason.
- The user has final decision authority over direction: scope, architecture, and costly-to-reverse choices. Do not implement or edit on their behalf when they are still exploring or comparing options.
- When the user has asked for implementation, prefer direct progress. Use safe, conventional defaults and existing project patterns for tactical details instead of asking about each one.
- State assumptions explicitly when multiple reasonable interpretations exist.
- When facts are needed, use read-only tools rather than guessing. Surface direction-level trade-offs only when they would materially change the outcome and the user has not chosen a path.
- Prefer evidence over confidence. Tool output is more reliable than assumptions.
- Never present guesses as facts. Mark uncertainty plainly when evidence is incomplete.
- Optimize for user-visible outcomes, not internal activity.
- Keep changes correct, readable, maintainable, testable, and secure.
- Do not push commits, rewrite history, or perform destructive actions unless explicitly instructed.

### Decision order

1. Understand the request and identify the actual success condition.
2. Gather only the context needed to act safely.
3. Plan or surface trade-offs when the work has meaningful phases, ambiguity, or undecided choices. Skip planning when the user has clearly requested a specific change and the next safe action is obvious.
4. Change the smallest surface that solves the problem - only after the user has requested implementation.
5. Verify before claiming success.
6. Ask the user only for direction-level decisions, when blocked, when the choice is costly to reverse, or when no safe default exists - not for routine tactical choices during a requested implementation.
7. Report the outcome, verification, and any remaining risk.
"#;

const CONTEXT_AND_EVIDENCE_CONTENT: &str = r#"# Context and Evidence

Treat provided context as useful signal, not guaranteed truth.

Do not assume file contents, repository structure, command output, test results, git state, API behavior, or web content when the answer depends on them.

Use tools to confirm facts whenever correctness depends on those facts.

### Evidence handling

- Read the relevant file before editing it.
- Use search results to decide what to inspect, not as a substitute for inspection.
- When the answer is already clear from current context, avoid unnecessary extra tool calls.
- Treat shell output, linter output, test output, and git output as source-of-truth for the current workspace state.
- If evidence contradicts your expectation, update your understanding immediately.
- If required evidence is unavailable, say what is missing and avoid pretending the task is fully verified.
"#;

const TOOL_USAGE_CONTENT: &str = r#"# Tool Usage

Use tools when they provide evidence that would otherwise be guessed.

Choose the narrowest tool that gives reliable evidence.

### Read vs write

- Read-only tools (read, search, browse, non-mutating shell inspection) are appropriate for questions, analysis, and exploration.
- Write tools and mutating shell commands are for when the user has clearly requested implementation - not because you inferred they would want a change.

### Preferred choices

- Use glob for file-name discovery.
- Use grep for exact strings, symbols, routes, config keys, and errors.
- Use get_workspace_tree for a quick project overview instead of manually traversing directories.
- Use shell for builds, tests, git, package commands, and repository inspection.
- Use edit_file first for normal edits. Use replace_file only when the situation truly calls for it. Use create_file for new files.

### Shell discipline

- Keep commands non-interactive.
- For long-running commands such as dev servers or watch mode, run shell with `block_until_ms=0`, then await the returned `shell_id` only when needed.

### Web and skills

- Use web_search for current or external information.
- Use browse_page after web_search finds a promising source, and quote retrieved content instead of inventing details.
- Use the available skill catalog in the system prompt to identify relevant `SKILL.md` folders.
- Read a skill's `SKILL.md` file directly when the task or an explicit /slug reference makes it relevant.
- Create or update skills by editing files under the documented skill roots when the user asks for reusable instructions; follow the `### Creating skills` format in the Skill Catalog section so `/slug` references work.

### Failure handling

1. Read the error code and message.
2. Form a new hypothesis.
3. Adjust the approach.

Do not repeat the same failing action without learning from the failure.

### spawn_subagent

Use spawn_subagent only for independent tasks that require meaningful exploration, verification, or research. Do not use it for simple lookups, single-file reads, or work that fits a few direct tool calls.
"#;

const COMMUNICATION_CONTENT: &str = r#"# Communication

Communicate conclusions, decisions, blockers, and verification results.

### Style

- Lead with the answer, result, or finding before process details.
- Be concise and direct.
- Do not provide routine progress narration for ordinary exploration or implementation.
- Do not narrate every tool call.
- Do not reveal hidden chain-of-thought.
- Do not frame internal activity as an accomplishment.
- Mention process details only for blockers, meaningful risk, user-requested transparency, or long-running work.
- Explain uncertainty and blockers honestly.
- When reporting completion, include the user-visible result and verification performed.

### Reviews

When the user asks for a review, lead with findings in severity order: correctness bugs, security risks, behavioral regressions, and missing tests for meaningful risk.

If no issues are found, say so and mention residual risk or unrun checks.
"#;

const CODE_NAVIGATION_CONTENT: &str = r#"# Code Navigation

Prefer direct signals over dependency wandering.

### Default flow

```text
search -> inspect -> modify
```

Avoid manually tracing long chains from entry point to imports unless direct search is insufficient.

### Search signals

Search for the most unique signal the target code would contain:

- function or method names: `calculateTotal`, `handleSubmit`
- constants or variables: `MAX_RETRY_COUNT`, `workspaceName`
- route strings: `"/api/users"`, `"/login"`
- framework annotations: `@RestController`, `@Service`
- trait, interface, or class names: `UserRepository`, `impl Iterator`
- test descriptions: `"should return 401"`, `testShould`
- config keys: `database.url`, `logging.level`
- model, table, or schema names: `users`, `class User`
- exact error messages from logs, tests, or users

### Reading discipline

- Read only files needed to understand or modify the target behavior.
- Prefer narrow reads around relevant code when files are large.
- Expand outward only when the local context is insufficient.
"#;

const CODE_MODIFICATION_CONTENT: &str = r#"# Code Modification

Make changes as a maintainer, not as a patch generator.

### Before editing

1. Locate the relevant implementation.
2. Understand surrounding context.
3. Identify the smallest change that solves the requested problem.

### Editing rules

- Prefer minimal, targeted changes.
- Follow existing naming, architecture, formatting, testing, and error-handling patterns.
- Do not rewrite working code unnecessarily.
- Do not change unrelated behavior.
- Do not introduce style-only edits unless requested.
- Do not remove functionality without a clear reason.
- Do not overwrite user changes. If the working tree is dirty, work with existing changes instead of reverting them.
- Use structured APIs or parsers for structured data when available.

### High-risk areas

Be extra careful with authentication, authorization, persistence, migrations, production configuration, secrets, and destructive operations.
"#;

const TASK_PLANNING_CONTENT: &str = r#"# Task Planning

Use the task-progress list to make meaningful multi-step work legible.
Do not create one for obvious single-path work just to look organized.
Default to no task list unless the work is long enough, risky enough, or multi-phase enough that the user would benefit from explicit tracking.

### Create a task list when

- implementing a feature across exploration, edits, and verification
- debugging with multiple hypotheses
- refactoring or migrating several files or layers
- finishing work with clear phases such as design, implement, test, polish
- running long work where the user may return later

### Skip a task list for

- short answers or explanations
- one-command requests
- a single obvious edit
- a short fix where the next safe step is clear
- pure exploration questions
- trivial follow-ups

When unsure, prefer no list over a noisy one.

### Task design

- Write outcome-oriented tasks: "Add OAuth callback validation", not "Read auth file".
- Keep tasks coarse enough for the user to follow, usually 3-5 items.
- Keep at most one task in progress.
- Mark tasks complete as soon as they are actually complete.
- Update the list when scope changes.
"#;

const VERIFICATION_CONTENT: &str = r#"# Verification

Do not claim success solely because code was changed.

### After changing code

1. Re-read the changed area when practical.
2. Review the diff to confirm only intended changes are included.
3. Before running any verification command, call list_shells first to check whether the user already has a running dev server or relevant process. If one exists, prefer telling the user to reload over starting a new instance. Only run a new verification command when no relevant process is already running.
4. Run the most relevant verification available.
5. Report what was verified and what was not.

### Prefer relevant checks

- TypeScript: `tsc --noEmit`, framework type checks, or project scripts.
- Tests: focused tests first, broader suites when risk is high.
- Builds: run when the change can affect packaging, routing, generated output, or runtime wiring.
- Linters: run or inspect diagnostics for changed files.

If verification fails, read the error, fix what is in scope, and rerun the relevant check. If verification cannot be run, state that clearly.
"#;

const GIT_WORKFLOW_CONTENT: &str = r#"# Git Workflow

Git operations must reflect actual repository state.

### Before committing

- Review `git status`.
- Review `git diff` and `git diff --staged` as appropriate.
- Do not assume staged content matches the current task.
- Do not commit secrets or credentials.

### Staging

- Stage only files related to the intended change.
- Avoid `git add .` and `git add -A` unless the user explicitly wants all changes included.
- Leave unrelated modifications unstaged.

### Commits

- Generate commit messages from staged changes only.
- Use Conventional Commits: `type(scope): summary`.
- Keep the subject under 72 characters.
- Keep commits logically coherent.

### Push behavior

- "commit" means commit only.
- "push" means push only.
- "commit and push" means both.
- Never push unless explicitly instructed.
"#;

const CODE_REVIEW_CONTENT: &str = r#"# Code Review Workflow

Use this workflow when reviewing code rather than implementing changes.

### Review focus

1. Correctness and edge cases.
2. Security issues such as injection, XSS, authorization gaps, and leaked secrets.
3. Behavioral regressions.
4. Error handling and failure modes.
5. Test coverage for meaningful behavior.
6. Readability and maintainability when it affects future correctness.

### Feedback format

- Lead with findings, ordered by severity.
- Cite the specific file or symbol involved.
- Explain the impact, not just the preference.
- Keep summaries brief and secondary.
- If there are no findings, say that clearly and list any verification gaps.
"#;

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::{Arc, Mutex};

    use crate::agent::registry::AgentRegistry;
    use crate::db::records::{current_timestamp_ms, AgentTodoRecord, MessageToolInvocation};
    use crate::db::session_store::{new_message_id, new_session_id, new_todo_id, put_agent_todo, put_message, put_session};
    use crate::scheduled_jobs::{ActiveRunRegistry, RunLock};
    use crate::tools::{McpRegistry, PageCache, RemoteConnectionPool, ShellRegistry};
    use crate::{agent, db::Database, AppState, SseBroadcaster};

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "coder-agent-messages-{label}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn create_test_state(workspace_dir: &PathBuf) -> Arc<AppState> {
        let coder_dir = temp_dir("coder-data");
        let db = Database::new(&coder_dir).expect("create db");
        Arc::new(AppState {
            workspace_dir: workspace_dir.clone(),
            http_base_url: "http://127.0.0.1:9".to_string(),
            db: Arc::new(Mutex::new(db)),
            agent_registry: Arc::new(Mutex::new(AgentRegistry::new().expect("agent registry"))),
            ask_question_registry: Arc::new(agent::ask_question::AskQuestionRegistry::new()),
            shell_registry: Arc::new(Mutex::new(ShellRegistry::new())),
            mcp_registry: Arc::new(McpRegistry::new()),
            page_cache: Arc::new(PageCache::new()),
            remote_pool: RemoteConnectionPool::new(),
            sse_broadcaster: Arc::new(SseBroadcaster::new()),
            scheduled_job_lock: Arc::new(RunLock::new()),
            scheduled_job_active_runs: Arc::new(ActiveRunRegistry::new()),
        })
    }

    fn sample_session(workspace_dir: &PathBuf) -> SessionRecord {
        SessionRecord {
            id: new_session_id(),
            title: "Test Session".to_string(),
            model: "gpt-test".to_string(),
            provider: "custom".to_string(),
            workspace_dir: Some(workspace_dir.to_string_lossy().to_string()),
            session_kind: "long_task".to_string(),
            autonomy_mode: "unattended".to_string(),
            decision_policy_version: "mvp-v1".to_string(),
            decision_model: Some("decision-model".to_string()),
            parent_session_id: None,
            handoff_from_session_id: None,
            handoff_message_id: None,
            handoff_phase: None,
            plan_file_name: None,
            plan_built_at: None,
            context_usage_snapshot: None,
            pinned_at: None,
            created_at: current_timestamp_ms(),
            updated_at: current_timestamp_ms(),
        }
    }

    #[test]
    fn assemble_agent_messages_trims_build_boundary_and_injects_skill_and_todos() {
        let workspace_dir = temp_dir("workspace");
        fs::write(
            workspace_dir.join("AGENTS.md"),
            "## Workspace rules\nKeep tests deterministic.\n",
        )
        .expect("write AGENTS");
        let skill_dir = workspace_dir.join(".coder").join("skills").join("demo-skill");
        fs::create_dir_all(&skill_dir).expect("create skill dir");
        fs::write(
            skill_dir.join("SKILL.md"),
            r#"---
name: demo-skill
description: Test fixture skill
---

# Demo Skill

Prefer deterministic test scaffolding.
"#,
        )
        .expect("write skill");

        let state = create_test_state(&workspace_dir);
        let session = sample_session(&workspace_dir);
        let db = state.db.lock().expect("db");
        put_session(&db, &session).expect("put session");
        put_agent_todo(
            &db,
            &AgentTodoRecord {
                id: new_todo_id(),
                session_id: session.id.clone(),
                content: "Ship backend parity".to_string(),
                status: "in_progress".to_string(),
                order: 0,
                created_at: current_timestamp_ms(),
                updated_at: current_timestamp_ms(),
            },
        )
        .expect("put todo");
        put_message(
            &db,
            &MessageRecord {
                id: new_message_id(),
                session_id: session.id.clone(),
                role: "user".to_string(),
                message_kind: None,
                content: "Should be trimmed away".to_string(),
                images: None,
                referenced_skills: None,
                thinking: String::new(),
                process_steps: None,
                tool_invocations: Vec::new(),
                status: "completed".to_string(),
                task_id: None,
                error: None,
                created_at: current_timestamp_ms(),
                duration_ms: None,
                usage: None,
            },
            true,
        )
        .expect("put old user");
        put_message(
            &db,
            &MessageRecord {
                id: new_message_id(),
                session_id: session.id.clone(),
                role: "assistant".to_string(),
                message_kind: None,
                content: "Old plan answer".to_string(),
                images: None,
                referenced_skills: None,
                thinking: String::new(),
                process_steps: None,
                tool_invocations: Vec::new(),
                status: "completed".to_string(),
                task_id: None,
                error: None,
                created_at: current_timestamp_ms(),
                duration_ms: None,
                usage: None,
            },
            true,
        )
        .expect("put old assistant");
        put_message(
            &db,
            &MessageRecord {
                id: new_message_id(),
                session_id: session.id.clone(),
                role: "user".to_string(),
                message_kind: None,
                content: "Please implement the following plan\n/demo-skill\n- finish the backend migration".to_string(),
                images: None,
                referenced_skills: Some(vec!["demo-skill".to_string()]),
                thinking: String::new(),
                process_steps: None,
                tool_invocations: Vec::new(),
                status: "completed".to_string(),
                task_id: None,
                error: None,
                created_at: current_timestamp_ms(),
                duration_ms: None,
                usage: None,
            },
            true,
        )
        .expect("put build user");
        drop(db);

        let messages = assemble_agent_messages(&state, &session, Some("agent")).expect("assemble messages");

        assert!(messages.len() >= 4);
        assert_eq!(messages[0].role, "system");
        let first_system = messages[0].content.as_ref().and_then(Value::as_str).expect("system text");
        assert!(first_system.contains("## Environment"));
        assert!(first_system.contains("## Skill Catalog"));
        assert!(first_system.contains("## Project instructions (AGENTS.md)"));

        let policy_message = messages[1].content.as_ref().and_then(Value::as_str).expect("policy text");
        assert!(policy_message.contains("## Session execution policy"));
        assert!(policy_message.contains("autonomyMode: unattended"));

        let todo_message = messages[2].content.as_ref().and_then(Value::as_str).expect("todo text");
        assert!(todo_message.contains("## Current session todo state"));
        assert!(todo_message.contains("Ship backend parity"));

        let user_message = messages
            .iter()
            .find(|message| message.role == "user")
            .expect("user message");
        let user_content = user_message.content.as_ref().and_then(Value::as_str).expect("user text");
        assert!(!user_content.contains("Should be trimmed away"));
        assert!(user_content.contains("Referenced skill: demo-skill"));
        assert!(user_content.contains("Prefer deterministic test scaffolding."));
        assert!(user_content.contains("Please implement the following plan"));
    }

    #[test]
    fn assemble_agent_messages_keeps_plain_text_slash_tokens_as_user_text() {
        let workspace_dir = temp_dir("plain-slash");
        let state = create_test_state(&workspace_dir);
        let session = sample_session(&workspace_dir);
        let db = state.db.lock().expect("db");
        put_session(&db, &session).expect("put session");
        put_message(
            &db,
            &MessageRecord {
                id: new_message_id(),
                session_id: session.id.clone(),
                role: "user".to_string(),
                message_kind: None,
                content: "/xxx please treat this as plain text".to_string(),
                images: None,
                referenced_skills: None,
                thinking: String::new(),
                process_steps: None,
                tool_invocations: Vec::new(),
                status: "completed".to_string(),
                task_id: None,
                error: None,
                created_at: current_timestamp_ms(),
                duration_ms: None,
                usage: None,
            },
            true,
        )
        .expect("put user");
        drop(db);

        let messages =
            assemble_agent_messages(&state, &session, Some("agent")).expect("assemble messages");
        let user_message = messages
            .iter()
            .find(|message| message.role == "user")
            .expect("user message");
        let user_content = user_message
            .content
            .as_ref()
            .and_then(Value::as_str)
            .expect("user text");
        assert_eq!(user_content, "/xxx please treat this as plain text");
        assert!(!user_content.contains("Referenced skill:"));
    }

    #[test]
    fn assemble_agent_messages_rebuilds_process_step_tool_chain() {
        let workspace_dir = temp_dir("process-steps");
        let state = create_test_state(&workspace_dir);
        let session = sample_session(&workspace_dir);
        let db = state.db.lock().expect("db");
        put_session(&db, &session).expect("put session");
        put_message(
            &db,
            &MessageRecord {
                id: new_message_id(),
                session_id: session.id.clone(),
                role: "assistant".to_string(),
                message_kind: None,
                content: String::new(),
                images: None,
                referenced_skills: None,
                thinking: "Reasoning fallback".to_string(),
                process_steps: Some(vec![
                    MessageProcessStep::Reasoning {
                        id: "r1".to_string(),
                        text: "Thinking...".to_string(),
                    },
                    MessageProcessStep::Answer {
                        id: "a1".to_string(),
                        text: "Calling tool".to_string(),
                    },
                    MessageProcessStep::Tool {
                        id: "t1".to_string(),
                        tool_call_id: "tool-1".to_string(),
                    },
                    MessageProcessStep::Answer {
                        id: "a2".to_string(),
                        text: "Final answer".to_string(),
                    },
                ]),
                tool_invocations: vec![MessageToolInvocation {
                    id: "tool-1".to_string(),
                    name: "read_file".to_string(),
                    input: json!({"path": "src/main.rs"}),
                    output: Some(json!({"ok": true, "path": "src/main.rs"})),
                    error_text: None,
                    state: "output-available".to_string(),
                }],
                status: "completed".to_string(),
                task_id: None,
                error: None,
                created_at: current_timestamp_ms(),
                duration_ms: None,
                usage: None,
            },
            true,
        )
        .expect("put assistant");
        drop(db);

        let messages = assemble_agent_messages(&state, &session, Some("agent")).expect("assemble");
        let replay = messages.into_iter().filter(|message| message.role != "system").collect::<Vec<_>>();
        assert_eq!(replay.len(), 3);
        assert_eq!(replay[0].role, "assistant");
        assert_eq!(
            replay[0]
                .tool_calls
                .as_ref()
                .and_then(|calls| calls.first())
                .map(|call| call.function.name.as_str()),
            Some("read_file")
        );
        assert_eq!(replay[1].role, "tool");
        assert_eq!(replay[1].tool_call_id.as_deref(), Some("tool-1"));
        assert_eq!(replay[2].role, "assistant");
        assert_eq!(replay[2].content.as_ref().and_then(Value::as_str), Some("Final answer"));
    }

    #[tokio::test]
    async fn resolve_agent_tool_definitions_dedupes_and_respects_mode_filters() {
        let workspace_dir = temp_dir("tools");
        let state = create_test_state(&workspace_dir);
        let extra = AgentToolDefinition {
            kind: "function".to_string(),
            function: super::super::types::AgentToolFunction {
                name: "read_file".to_string(),
                description: "duplicate".to_string(),
                parameters: json!({"type": "object"}),
            },
        };
        let custom = AgentToolDefinition {
            kind: "function".to_string(),
            function: super::super::types::AgentToolFunction {
                name: "custom_preview".to_string(),
                description: "custom".to_string(),
                parameters: json!({"type": "object"}),
            },
        };

        let tools = resolve_agent_tool_definitions(&state, Some("ask"), false, Some(vec![extra, custom]))
            .await;
        let names = tools.iter().map(|tool| tool.function.name.as_str()).collect::<Vec<_>>();

        assert!(names.contains(&"read_file"));
        assert!(names.contains(&"custom_preview"));
        assert!(!names.contains(&"create_file"));
        assert_eq!(names.iter().filter(|name| **name == "read_file").count(), 1);
    }

    #[test]
    fn mcp_tool_definition_normalizes_schema() {
        let server = McpServerConfig {
            id: "server1".to_string(),
            name: "Server One".to_string(),
            transport: "stdio".to_string(),
            command: "cmd".to_string(),
            args: Vec::new(),
            env: Default::default(),
            url: String::new(),
            headers: Default::default(),
            enabled: true,
        };
        let tool = crate::tools::mcp::McpToolDefinition {
            name: "lookup".to_string(),
            description: Some("Lookup value".to_string()),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "search text" },
                    "count": { "type": "integer", "enum": ["1", "2"] },
                    "bad": { "type": "null" }
                },
                "required": ["query"],
                "additionalProperties": false
            }),
        };

        let definition = mcp_tool_to_agent_definition(&server, tool);
        assert_eq!(definition.function.name, "mcp__server1__lookup");
        assert!(definition.function.description.contains("[MCP: Server One]"));
        assert_eq!(definition.function.parameters["type"], "object");
        assert!(definition.function.parameters["properties"]["query"].is_object());
        assert!(definition.function.parameters["properties"].get("bad").is_none());
        assert_eq!(definition.function.parameters["additionalProperties"], false);
    }

    #[test]
    fn compact_description_truncates_on_character_boundaries() {
        let input = format!("{}额外说明", "工具".repeat(120));
        let output = compact_description(&input);
        assert!(output.ends_with("..."));
        assert_eq!(output.chars().count(), 220);
    }
}
