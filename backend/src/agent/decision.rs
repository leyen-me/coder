use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{
    openai::{chat_completions_url, complete_chat_completion},
    types::ChatMessage,
};

const PROXY_DECISION_SYSTEM_PROMPT: &str = r#"You are the proxy decision model for an unattended coding task.
Return exactly one JSON object and nothing else.
You will receive the full conversation history between the user and the main agent.
Your job is to review the conversation and decide whether the main agent's latest answer has genuinely completed the user's original request.
Write in the same language as the conversation.

- If the task is truly finished, return complete.
- If more work is needed, return continue and provide the exact next user-style continuation input that should be sent back to the main agent.
- Never ask for real-user confirmation unless the request explicitly requires new external information that the proxy cannot supply.

JSON schema:
{
  "outcome": "continue" | "complete",
  "selectedOptionId": string | null,
  "reason": string,
  "riskLevel": "low" | "medium" | "high",
  "recordAsAssumption": boolean,
  "requiresUserConfirmation": boolean,
  "assumption": string | null,
  "suggestedContinuation": string | null
}"#;

const DEFAULT_PROXY_CONTINUATION: &str =
    "继续，任务还没有完成。请基于当前上下文自行推进，直到真正完成为止。";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionOption {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionRequest {
    pub session_id: String,
    pub task_id: String,
    pub trigger: String,
    pub summary: String,
    pub question: String,
    pub options: Vec<DecisionOption>,
    pub risk_hints: Vec<String>,
    pub session_kind: String,
    pub autonomy_mode: String,
    pub decision_policy_version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assistant_response: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionResponse {
    pub outcome: String,
    pub selected_option_id: Option<String>,
    pub reason: String,
    pub risk_level: String,
    pub record_as_assumption: bool,
    pub requires_user_confirmation: bool,
    pub assumption: Option<String>,
    pub suggested_continuation: Option<String>,
}

pub fn build_final_answer_decision_request(
    session_id: &str,
    task_id: &str,
    assistant_response: &str,
    session_kind: &str,
    autonomy_mode: &str,
    decision_policy_version: &str,
) -> DecisionRequest {
    DecisionRequest {
        session_id: session_id.to_string(),
        task_id: task_id.to_string(),
        trigger: "final_answer".to_string(),
        summary:
            "The main agent has produced a candidate final answer in an unattended long-task session."
                .to_string(),
        question: assistant_response.trim().to_string(),
        options: vec![
            DecisionOption {
                id: "complete".to_string(),
                label: "The task is complete and the assistant answer can stand as final"
                    .to_string(),
            },
            DecisionOption {
                id: "continue".to_string(),
                label: "The task is not complete; provide the next user-style continuation input"
                    .to_string(),
            },
        ],
        risk_hints: vec![
            "Return complete only if the task is genuinely finished.".to_string(),
            "If more work is needed, return continue and provide the next user-style continuation input."
                .to_string(),
        ],
        session_kind: session_kind.to_string(),
        autonomy_mode: autonomy_mode.to_string(),
        decision_policy_version: decision_policy_version.to_string(),
        assistant_response: Some(assistant_response.trim().to_string()),
    }
}

pub fn should_request_proxy_decision(session_kind: &str, autonomy_mode: &str) -> bool {
    session_kind == "long_task" || autonomy_mode == "unattended"
}

pub fn proxy_decision_system_prompt() -> &'static str {
    PROXY_DECISION_SYSTEM_PROMPT
}

pub fn build_proxy_decision_user_prompt(request: &DecisionRequest) -> Result<String, String> {
    serde_json::to_string_pretty(&serde_json::json!({
        "task": "ProxyDecision",
        "instruction": "Based on the full conversation above, decide whether the unattended long-task session is complete, or provide the next user-style continuation input for the main agent.",
        "request": request,
    }))
    .map_err(|error| format!("Failed to encode proxy decision prompt: {error}"))
}

pub async fn request_proxy_decision(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
    model: &str,
    request: &DecisionRequest,
    conversation_messages: &[ChatMessage],
) -> Result<DecisionResponse, String> {
    let user_prompt = build_proxy_decision_user_prompt(request)?;

    let mut messages = Vec::with_capacity(conversation_messages.len() + 2);
    messages.push(ChatMessage {
        role: "system".to_string(),
        content: Some(Value::String(PROXY_DECISION_SYSTEM_PROMPT.to_string())),
        reasoning_content: None,
        tool_calls: None,
        tool_call_id: None,
        name: None,
    });
    messages.extend_from_slice(conversation_messages);
    messages.push(ChatMessage {
        role: "user".to_string(),
        content: Some(Value::String(user_prompt)),
        reasoning_content: None,
        tool_calls: None,
        tool_call_id: None,
        name: None,
    });

    let raw = complete_chat_completion(
        client,
        chat_completions_url(base_url),
        api_key,
        model,
        &messages,
        2048,
    )
    .await?
    .ok_or_else(|| "Decision model returned empty content".to_string())?;

    let parsed = serde_json::from_str::<Value>(&extract_json_object(&raw)?)
        .map_err(|error| format!("Decision response was not valid JSON: {error}"))?;
    normalize_decision_response(&parsed)
}

pub fn build_proxy_continuation_message(response: &DecisionResponse) -> ChatMessage {
    let suggested = response
        .suggested_continuation
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_PROXY_CONTINUATION);
    ChatMessage {
        role: "user".to_string(),
        content: Some(Value::String(suggested.to_string())),
        reasoning_content: None,
        tool_calls: None,
        tool_call_id: None,
        name: None,
    }
}

fn extract_json_object(content: &str) -> Result<String, String> {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return Err("Decision model returned empty content".to_string());
    }
    if let Some(start) = trimmed.find("```") {
        if let Some(end) = trimmed.rfind("```") {
            if end > start {
                let fenced = trimmed[start + 3..end]
                    .trim()
                    .strip_prefix("json")
                    .map(str::trim)
                    .unwrap_or_else(|| trimmed[start + 3..end].trim());
                if fenced.starts_with('{') && fenced.ends_with('}') {
                    return Ok(fenced.to_string());
                }
            }
        }
    }
    let first = trimmed
        .find('{')
        .ok_or_else(|| "Decision model did not return a JSON object".to_string())?;
    let last = trimmed
        .rfind('}')
        .ok_or_else(|| "Decision model did not return a JSON object".to_string())?;
    if last <= first {
        return Err("Decision model did not return a JSON object".to_string());
    }
    Ok(trimmed[first..=last].to_string())
}

fn normalize_decision_response(raw: &Value) -> Result<DecisionResponse, String> {
    let Some(object) = raw.as_object() else {
        return Err("Decision response must be an object".to_string());
    };

    let outcome = object
        .get("outcome")
        .and_then(Value::as_str)
        .ok_or_else(|| "Decision response has an invalid outcome".to_string())?;
    if !matches!(outcome, "continue" | "complete" | "ask_user" | "stop_path") {
        return Err("Decision response has an invalid outcome".to_string());
    }

    let risk_level = object
        .get("riskLevel")
        .or_else(|| object.get("risk_level"))
        .and_then(Value::as_str)
        .ok_or_else(|| "Decision response has an invalid risk level".to_string())?;
    if !matches!(risk_level, "low" | "medium" | "high") {
        return Err("Decision response has an invalid risk level".to_string());
    }

    Ok(DecisionResponse {
        outcome: outcome.to_string(),
        selected_option_id: object
            .get("selectedOptionId")
            .or_else(|| object.get("selected_option_id"))
            .and_then(Value::as_str)
            .map(str::to_string),
        reason: object
            .get("reason")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("No reason provided.")
            .to_string(),
        risk_level: risk_level.to_string(),
        record_as_assumption: object
            .get("recordAsAssumption")
            .or_else(|| object.get("record_as_assumption"))
            .and_then(Value::as_bool)
            .unwrap_or(false),
        requires_user_confirmation: object
            .get("requiresUserConfirmation")
            .or_else(|| object.get("requires_user_confirmation"))
            .and_then(Value::as_bool)
            .unwrap_or(false),
        assumption: object
            .get("assumption")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
        suggested_continuation: object
            .get("suggestedContinuation")
            .or_else(|| object.get("suggested_continuation"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::PathBuf};

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Fixture {
        name: String,
        input: FixtureInput,
        expected: FixtureExpected,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct FixtureInput {
        session_id: String,
        task_id: String,
        assistant_response: String,
        session_kind: String,
        autonomy_mode: String,
        decision_policy_version: String,
        decision_response_content: String,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct FixtureExpected {
        should_request_proxy_decision: Option<bool>,
        final_answer_decision_request: Option<Value>,
        proxy_decision_system_prompt: Option<String>,
        proxy_decision_user_prompt_object: Option<Value>,
        normalized_decision_response: Option<Value>,
        proxy_continuation_user_message: Option<Value>,
    }

    fn load_fixtures() -> Vec<Fixture> {
        let fixture_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../testdata/unattended-decision");
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

    #[test]
    fn shared_unattended_decision_fixtures_match_backend_helpers() {
        for fixture in load_fixtures() {
            let input = &fixture.input;
            let expected = &fixture.expected;

            if let Some(expected_value) = expected.should_request_proxy_decision {
                assert_eq!(
                    should_request_proxy_decision(&input.session_kind, &input.autonomy_mode),
                    expected_value,
                    "shouldRequestProxyDecision fixture {}",
                    fixture.name
                );
            }

            let request = build_final_answer_decision_request(
                &input.session_id,
                &input.task_id,
                &input.assistant_response,
                &input.session_kind,
                &input.autonomy_mode,
                &input.decision_policy_version,
            );

            if let Some(expected_request) = &expected.final_answer_decision_request {
                assert_eq!(
                    serde_json::to_value(&request).expect("serialize request"),
                    *expected_request,
                    "finalAnswerDecisionRequest fixture {}",
                    fixture.name
                );
            }

            if let Some(expected_prompt) = &expected.proxy_decision_system_prompt {
                assert_eq!(
                    proxy_decision_system_prompt(),
                    expected_prompt,
                    "proxyDecisionSystemPrompt fixture {}",
                    fixture.name
                );
            }

            if let Some(expected_prompt_object) = &expected.proxy_decision_user_prompt_object {
                assert_eq!(
                    serde_json::from_str::<Value>(
                        &build_proxy_decision_user_prompt(&request)
                            .expect("build proxy decision user prompt"),
                    )
                    .expect("parse proxy decision user prompt"),
                    *expected_prompt_object,
                    "proxyDecisionUserPromptObject fixture {}",
                    fixture.name
                );
            }

            let normalized_response = normalize_decision_response(
                &serde_json::from_str::<Value>(&extract_json_object(&input.decision_response_content).expect("extract decision json"))
                    .expect("parse extracted decision json"),
            )
            .expect("normalize decision response");

            if let Some(expected_response) = &expected.normalized_decision_response {
                assert_eq!(
                    serde_json::to_value(&normalized_response)
                        .expect("serialize normalized decision response"),
                    *expected_response,
                    "normalizedDecisionResponse fixture {}",
                    fixture.name
                );
            }

            if let Some(expected_message) = &expected.proxy_continuation_user_message {
                let message = build_proxy_continuation_message(&normalized_response);
                assert_eq!(
                    serde_json::json!({
                        "role": message.role,
                        "content": message.content.and_then(|value| value.as_str().map(str::to_string)),
                    }),
                    *expected_message,
                    "proxyContinuationUserMessage fixture {}",
                    fixture.name
                );
            }
        }
    }
}
