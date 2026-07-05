use reqwest::Client;
use serde_json::{json, Map, Value};

pub fn tool_api_path(name: &str) -> Option<&'static str> {
    match name {
        "list_dir" => Some("/api/tool_list_dir"),
        "read_file" => Some("/api/tool_read_file"),
        "write_file" => Some("/api/tool_write_file"),
        "replace_file" => Some("/api/tool_replace_file"),
        "edit_file" => Some("/api/tool_edit_file"),
        "replace_lines" => Some("/api/tool_replace_lines"),
        "glob" => Some("/api/tool_glob"),
        "grep" => Some("/api/tool_grep"),
        "shell" => Some("/api/tool_shell"),
        "remote_shell" => Some("/api/tool_remote_shell"),
        "await" => Some("/api/tool_await"),
        "list_shells" => Some("/api/shell_list"),
        "kill_shell" => Some("/api/shell_kill"),
        "read_shell_logs" => Some("/api/shell_read_logs"),
        "web_search" => Some("/api/tool_web_search"),
        "browse_page" => Some("/api/tool_browse_page"),
        "get_workspace_tree" => Some("/api/tool_get_workspace_tree"),
        "todo_read" => Some("/api/tool_todo_read"),
        "todo_write" => Some("/api/tool_todo_write"),
        "list_skills" => Some("/api/tool_list_skills"),
        "read_skill" => Some("/api/tool_read_skill"),
        "create_skill" => Some("/api/tool_create_skill"),
        "update_skill" => Some("/api/tool_update_skill"),
        "spawn_subagent" => Some("/api/tool_spawn_subagent"),
        "send_email" => Some("/api/send_email"),
        "plan_create" => Some("/api/tool_plan_create"),
        "plan_read" => Some("/api/tool_plan_read"),
        "plan_update" => Some("/api/tool_plan_update"),
        "plan_edit" => Some("/api/tool_plan_edit"),
        "plan_delete" => Some("/api/tool_plan_delete"),
        "plan_list" => Some("/api/tool_plan_list"),
        _ => None,
    }
}

pub async fn execute_tool_call(
    client: &Client,
    base_url: &str,
    tool_name: &str,
    raw_arguments: &str,
    workspace_dir: Option<&str>,
    session_id: &str,
    task_id: &str,
) -> String {
    let path = match tool_api_path(tool_name) {
        Some(value) => value,
        None => {
            return serialize_failure(
                tool_name,
                "unsupported_tool",
                &format!("Unsupported tool: {tool_name}"),
            );
        }
    };

    let args: Value = match serde_json::from_str(raw_arguments) {
        Ok(value) => value,
        Err(error) => {
            return serialize_failure(
                tool_name,
                "invalid_arguments",
                &format!("Invalid tool arguments JSON: {error}"),
            );
        }
    };

    let body = build_tool_request_body(
        tool_name,
        args,
        workspace_dir,
        session_id,
        task_id,
    );

    let url = format!("{}{}", base_url.trim_end_matches('/'), path);
    let response = client.post(url).json(&body).send().await;

    match response {
        Ok(resp) if resp.status().is_success() => {
            let data: Value = resp.json().await.unwrap_or(json!({}));
            serialize_success(tool_name, data)
        }
        Ok(resp) => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            serialize_failure(
                tool_name,
                "execution_failed",
                &format!("HTTP {status}: {body}"),
            )
        }
        Err(error) => serialize_failure(
            tool_name,
            "execution_failed",
            &format!("Tool request failed: {error}"),
        ),
    }
}

fn build_tool_request_body(
    tool_name: &str,
    args: Value,
    workspace_dir: Option<&str>,
    session_id: &str,
    task_id: &str,
) -> Value {
    let mut map = match args {
        Value::Object(object) => object,
        _ => Map::new(),
    };

    if tool_name != "send_email" {
        if !map.contains_key("workspaceDir") {
            if let Some(dir) = workspace_dir {
                map.insert("workspaceDir".to_string(), json!(dir));
            }
        }
    }

    if matches!(
        tool_name,
        "shell" | "remote_shell" | "spawn_subagent" | "todo_read" | "todo_write"
    ) {
        map.entry("sessionId".to_string())
            .or_insert_with(|| json!(session_id));
        map.entry("taskId".to_string())
            .or_insert_with(|| json!(task_id));
    }

    Value::Object(map)
}

fn serialize_success(tool: &str, data: Value) -> String {
    json!({ "ok": true, "tool": tool, "data": data }).to_string()
}

fn serialize_failure(tool: &str, code: &str, message: &str) -> String {
    json!({
        "ok": false,
        "tool": tool,
        "error": { "code": code, "message": message }
    })
    .to_string()
}
