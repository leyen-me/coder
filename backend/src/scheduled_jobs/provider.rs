use serde::Deserialize;
use serde_json::Value;

use crate::http::routes_settings::get_setting;

const MODEL_PROVIDER_SETTINGS_KEY: &str = "coder:model-provider-settings";
const DEFAULT_MODEL_CONTEXT_WINDOW: u32 = 200_000;

#[derive(Debug, Clone)]
pub struct ResolvedJobRuntime {
    pub provider: String,
    pub base_url: String,
    pub api_key: Option<String>,
    pub api_key_source: String,
    pub api_key_env_var: String,
    pub max_context_tokens: u32,
    pub request_extensions: Option<Value>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProviderSettings {
    #[serde(default)]
    api_key_source: String,
    #[serde(default)]
    api_key: String,
    #[serde(default)]
    api_key_env_var: String,
    #[serde(default)]
    custom_base_url: String,
    #[serde(default)]
    custom_models: Value,
}

fn read_provider_settings(provider: &str) -> ProviderSettings {
    let raw = get_setting(MODEL_PROVIDER_SETTINGS_KEY)
        .and_then(|value| serde_json::from_str::<Value>(&value).ok())
        .unwrap_or_else(|| Value::Object(Default::default()));
    raw.get("providers")
        .and_then(|providers| providers.get(provider))
        .and_then(|value| serde_json::from_value::<ProviderSettings>(value.clone()).ok())
        .unwrap_or_default()
}

fn preset_base_url(provider: &str) -> Option<&'static str> {
    match provider {
        "deepseek" => Some("https://api.deepseek.com"),
        "glm" => Some("https://open.bigmodel.cn/api/paas/v4"),
        "agnes" => Some("https://apihub.agnes-ai.com/v1"),
        "nvidia" => Some("https://integrate.api.nvidia.com/v1"),
        "minimax" => Some("https://api.minimaxi.com/v1"),
        _ => None,
    }
}

fn default_api_key_env_var(provider: &str) -> &'static str {
    match provider {
        "deepseek" => "DEEPSEEK_API_KEY",
        "glm" => "GLM_API_KEY",
        "agnes" => "AGNES_API_KEY",
        "nvidia" => "NVIDIA_API_KEY",
        "minimax" => "MINIMAX_API_KEY",
        _ => "OPENAI_API_KEY",
    }
}

fn provider_base_url(provider: &str, settings: &ProviderSettings) -> Result<String, String> {
    if provider == "custom" {
        let base_url = settings.custom_base_url.trim();
        if base_url.is_empty() {
            return Err("Custom provider base URL is empty".to_string());
        }
        return Ok(base_url.to_string());
    }

    preset_base_url(provider)
        .map(str::to_string)
        .ok_or_else(|| format!("Unknown provider: {provider}"))
}

fn provider_api_key_source(settings: &ProviderSettings) -> String {
    match settings.api_key_source.trim() {
        "manual" => "manual".to_string(),
        _ => "env".to_string(),
    }
}

fn provider_api_key_env_var(provider: &str, settings: &ProviderSettings) -> String {
    let configured = settings.api_key_env_var.trim();
    if configured.is_empty() {
        default_api_key_env_var(provider).to_string()
    } else {
        configured.to_string()
    }
}

fn find_custom_model<'a>(models: &'a Value, model_id: &str) -> Option<&'a serde_json::Map<String, Value>> {
    models
        .as_array()?
        .iter()
        .find_map(|item| item.as_object())
        .filter(|model| model.get("id").and_then(Value::as_str) == Some(model_id))
}

fn model_context_window(provider: &str, custom_models: &Value, model_id: &str) -> u32 {
    if let Some(model) = find_custom_model(custom_models, model_id) {
        if let Some(value) = model.get("contextWindow").and_then(Value::as_u64) {
            return value.min(u32::MAX as u64) as u32;
        }
    }

    match model_id {
        "deepseek-v4-flash" | "deepseek-v4-pro" => 1_000_000,
        "glm-5" | "glm-4.7" | "glm-4.7-flash" => 200_000,
        "glm-4.5-air" => 128_000,
        "agnes-2.0-flash" | "agnes-1.5-flash" => 256_000,
        "MiniMax-M3" => 1_000_000,
        "MiniMax-M2.7" => 204_800,
        _ if provider == "deepseek" => 1_000_000,
        _ => DEFAULT_MODEL_CONTEXT_WINDOW,
    }
}

fn configured_thinking_config(
    custom_models: &Value,
    model_id: &str,
    thinking_enabled: bool,
) -> Option<Value> {
    let model = find_custom_model(custom_models, model_id)?;
    let thinking_config = model.get("thinkingConfig")?.as_object()?;
    let key = if thinking_enabled { "enabled" } else { "disabled" };
    let value = thinking_config.get(key)?.clone();
    match &value {
        Value::Object(object) if object.is_empty() => None,
        _ => Some(value),
    }
}

fn default_thinking_extensions(
    provider: &str,
    model_id: &str,
    thinking_enabled: bool,
) -> Option<Value> {
    let value = match provider {
        "deepseek" => {
            if thinking_enabled {
                serde_json::json!({
                    "thinking": { "type": "enabled" },
                    "reasoning_effort": "high",
                })
            } else {
                serde_json::json!({
                    "thinking": { "type": "disabled" },
                })
            }
        }
        "glm" => {
            if thinking_enabled {
                serde_json::json!({
                    "thinking": { "type": "enabled" },
                })
            } else {
                serde_json::json!({
                    "thinking": { "type": "disabled" },
                })
            }
        }
        "agnes" => {
            if thinking_enabled {
                serde_json::json!({
                    "chat_template_kwargs": { "enable_thinking": true },
                })
            } else {
                Value::Object(Default::default())
            }
        }
        "minimax" => {
            if thinking_enabled {
                serde_json::json!({
                    "thinking": { "type": "adaptive" },
                    "reasoning_split": true,
                })
            } else {
                serde_json::json!({
                    "thinking": { "type": "disabled" },
                })
            }
        }
        "nvidia" => {
            if thinking_enabled {
                serde_json::json!({
                    "chat_template_kwargs": { "enable_thinking": true },
                })
            } else {
                serde_json::json!({
                    "chat_template_kwargs": { "enable_thinking": false },
                })
            }
        }
        "custom" if model_id.starts_with("glm") => {
            if thinking_enabled {
                serde_json::json!({
                    "thinking": { "type": "enabled" },
                })
            } else {
                serde_json::json!({
                    "thinking": { "type": "disabled" },
                })
            }
        }
        _ => Value::Object(Default::default()),
    };

    match value {
        Value::Object(object) if object.is_empty() => None,
        other => Some(other),
    }
}

pub fn resolve_job_runtime(
    provider_id: &str,
    model_id: &str,
    thinking_enabled: bool,
) -> Result<ResolvedJobRuntime, String> {
    let provider = if provider_id.trim().is_empty() {
        infer_provider_from_model(model_id)
    } else {
        provider_id.trim().to_ascii_lowercase()
    };
    let settings = read_provider_settings(&provider);
    let api_key_source = provider_api_key_source(&settings);
    let api_key_env_var = provider_api_key_env_var(&provider, &settings);
    let api_key = if api_key_source == "manual" {
        let manual = settings.api_key.trim();
        if manual.is_empty() {
            return Err(format!("Manual API key is empty for provider {provider}"));
        }
        Some(manual.to_string())
    } else {
        None
    };

    Ok(ResolvedJobRuntime {
        provider: provider.clone(),
        base_url: provider_base_url(&provider, &settings)?,
        api_key,
        api_key_source,
        api_key_env_var,
        max_context_tokens: model_context_window(&provider, &settings.custom_models, model_id),
        request_extensions: configured_thinking_config(&settings.custom_models, model_id, thinking_enabled)
            .or_else(|| default_thinking_extensions(&provider, model_id, thinking_enabled)),
    })
}

fn infer_provider_from_model(model_id: &str) -> String {
    let lower = model_id.trim().to_ascii_lowercase();
    if lower.starts_with("deepseek") {
        "deepseek".to_string()
    } else if lower.starts_with("glm") {
        "glm".to_string()
    } else if lower.starts_with("agnes") {
        "agnes".to_string()
    } else if lower.starts_with("minimax") {
        "minimax".to_string()
    } else {
        "custom".to_string()
    }
}
