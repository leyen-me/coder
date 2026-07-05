use serde::Deserialize;
use serde_json::{json, Value};

use crate::get_coder_data_dir;

#[derive(Debug, Clone)]
pub struct ResolvedProvider {
    pub provider: String,
    pub base_url: String,
    pub api_key: String,
    pub api_key_source: String,
    pub api_key_env_var: String,
    pub models: Value,
}

#[derive(Debug, Deserialize)]
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelProviderSettings {
    #[serde(default)]
    active_provider: String,
    #[serde(default)]
    enabled_providers: Vec<String>,
    #[serde(default)]
    providers: Value,
}

fn load_settings_json() -> Value {
    let path = get_coder_data_dir().join("settings.json");
    if !path.exists() {
        return json!({});
    }
    std::fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_else(|| json!({}))
}

fn read_model_provider_settings() -> ModelProviderSettings {
    let settings = load_settings_json();
    let raw = settings
        .get("coder:model-provider-settings")
        .cloned()
        .unwrap_or_else(|| json!({}));
    serde_json::from_value(raw).unwrap_or(ModelProviderSettings {
        active_provider: "deepseek".to_string(),
        enabled_providers: vec!["deepseek".to_string()],
        providers: json!({}),
    })
}

fn preset_base_url(provider: &str) -> Option<&'static str> {
    match provider {
        "deepseek" => Some("https://api.deepseek.com"),
        "glm" => Some("https://open.bigmodel.cn/api/paas/v4"),
        "agnes" => Some("https://api.agnes-ai.com"),
        "nvidia" => Some("https://integrate.api.nvidia.com"),
        "minimax" => Some("https://api.minimax.chat/v1"),
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

fn parse_provider_settings(providers: &Value, provider: &str) -> ProviderSettings {
    providers
        .get(provider)
        .and_then(|value| serde_json::from_value::<ProviderSettings>(value.clone()).ok())
        .unwrap_or(ProviderSettings {
            api_key_source: "env".to_string(),
            api_key: String::new(),
            api_key_env_var: default_api_key_env_var(provider).to_string(),
            custom_base_url: String::new(),
            custom_models: json!([]),
        })
}

/// Resolve API key the same way as chat (`agent/registry.rs` + frontend model-preference).
fn resolve_api_key(settings: &ProviderSettings, provider: &str) -> Result<String, String> {
    let source = settings.api_key_source.trim();
    let source = if source.is_empty() { "env" } else { source };

    if source == "manual" {
        let trimmed = settings.api_key.trim();
        if trimmed.is_empty() {
            return Err(format!(
                "Manual API key is empty for provider {provider}"
            ));
        }
        return Ok(trimmed.to_string());
    }

    let env_var = {
        let configured = settings.api_key_env_var.trim();
        if configured.is_empty() {
            default_api_key_env_var(provider)
        } else {
            configured
        }
    };

    if let Some(value) = crate::shell_env::get_env_var(env_var) {
        return Ok(value);
    }

    // Legacy fallback: top-level keys in settings.json (matches agent registry).
    if let Ok(content) = std::fs::read_to_string(get_coder_data_dir().join("settings.json")) {
        if let Ok(map) = serde_json::from_str::<Value>(&content) {
            for key in [env_var, "OPENAI_API_KEY", "DEEPSEEK_API_KEY"] {
                if let Some(val) = map.get(key).and_then(|v| v.as_str()) {
                    let trimmed = val.trim();
                    if !trimmed.is_empty() {
                        return Ok(trimmed.to_string());
                    }
                }
            }
        }
    }

    Err(format!(
        "Missing API key for provider {provider}. Set the {env_var} environment variable or configure a manual key in settings."
    ))
}

pub fn resolve_provider(provider_id: &str) -> Result<ResolvedProvider, String> {
    let settings = read_model_provider_settings();
    let provider = if provider_id.trim().is_empty() {
        settings.active_provider.clone()
    } else {
        provider_id.trim().to_string()
    };

    let provider_settings = parse_provider_settings(&settings.providers, &provider);
    let api_key = resolve_api_key(&provider_settings, &provider)?;

    let (base_url, models) = if provider == "custom" {
        (
            provider_settings.custom_base_url.trim().to_string(),
            provider_settings.custom_models.clone(),
        )
    } else {
        (
            preset_base_url(&provider)
                .ok_or_else(|| format!("Unknown provider: {provider}"))?
                .to_string(),
            provider_settings.custom_models.clone(),
        )
    };

    if base_url.is_empty() {
        return Err("Provider base URL is empty".to_string());
    }

    Ok(ResolvedProvider {
        provider,
        base_url,
        api_key,
        api_key_source: provider_settings.api_key_source,
        api_key_env_var: provider_settings.api_key_env_var,
        models,
    })
}

pub fn resolve_model(job_model: &str, provider: &ResolvedProvider) -> String {
    let trimmed = job_model.trim();
    if trimmed.is_empty() {
        return default_model_for_provider(&provider.provider);
    }

    if model_exists(&provider.models, trimmed) {
        return trimmed.to_string();
    }

    default_model_for_provider(&provider.provider)
}

fn model_exists(models: &Value, model_id: &str) -> bool {
    models
        .as_array()
        .map(|items| {
            items.iter().any(|item| {
                item.get("id")
                    .and_then(|value| value.as_str())
                    .map(|id| id == model_id)
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

fn default_model_for_provider(provider: &str) -> String {
    match provider {
        "deepseek" => "deepseek-chat".to_string(),
        "glm" => "glm-4-flash".to_string(),
        "minimax" => "MiniMax-Text-01".to_string(),
        "nvidia" => "meta/llama-3.1-8b-instruct".to_string(),
        _ => "gpt-4o-mini".to_string(),
    }
}

pub fn resolve_workspace_dir(
    requested: Option<&str>,
    fallback: &std::path::Path,
) -> Option<String> {
    requested
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| {
            load_settings_json()
                .get("coder:workspace-dir")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
        .or_else(|| Some(fallback.display().to_string()))
}

pub fn model_supports_thinking(models: &Value, model_id: &str) -> bool {
    models
        .as_array()
        .and_then(|items| {
            items.iter().find(|item| {
                item.get("id")
                    .and_then(|value| value.as_str())
                    .map(|id| id == model_id)
                    .unwrap_or(false)
            })
        })
        .and_then(|item| item.get("supportsThinking"))
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn env_source_ignores_stale_manual_key() {
        let settings = ProviderSettings {
            api_key_source: "env".to_string(),
            api_key: "sk-stale-invalid-key".to_string(),
            api_key_env_var: "CODER_TEST_NONEXISTENT_KEY_VAR".to_string(),
            custom_base_url: String::new(),
            custom_models: json!([]),
        };

        let result = resolve_api_key(&settings, "deepseek");
        assert!(result.is_err());
    }

    #[test]
    fn manual_source_uses_manual_key() {
        let settings = ProviderSettings {
            api_key_source: "manual".to_string(),
            api_key: "sk-manual-key".to_string(),
            api_key_env_var: "DEEPSEEK_API_KEY".to_string(),
            custom_base_url: String::new(),
            custom_models: json!([]),
        };

        assert_eq!(
            resolve_api_key(&settings, "deepseek").unwrap(),
            "sk-manual-key"
        );
    }
}
