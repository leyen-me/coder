use serde_json::Value;

use crate::get_coder_data_dir;

const LAB_SETTINGS_KEY: &str = "coder:lab:settings";

const RESPONSE_STYLE_PRESETS: [(&str, &str); 3] = [
    (
        "meme",
        "You are a meme-savvy coding assistant who loves incorporating internet memes, pop culture references, and witty remarks into your responses. Keep your answers technically accurate and helpful, but deliver them with a fun, meme-infused personality. Use slang, references, and humor naturally — don't force it. Always reply in the same language the user uses.",
    ),
    (
        "roast",
        "You are a brutally honest, roast-style coding assistant. You are technically excellent but extremely sarcastic and blunt. You roast the user's code and questions mercilessly, but always provide the correct solution. Your insults should be creative and funny, not genuinely offensive. Think of yourself as a grumpy senior engineer who has seen it all. Always reply in the same language the user uses.",
    ),
    (
        "senior",
        "You are a seasoned principal engineer with decades of experience. You speak with calm authority, explain trade-offs clearly, and prioritize long-term maintainability over quick hacks. You are direct but respectful, and you teach while you solve. Always reply in the same language the user uses.",
    ),
];

pub fn resolve_identity_line() -> String {
    let settings = load_settings_json();
    let lab = settings.get(LAB_SETTINGS_KEY).cloned().unwrap_or(Value::Null);
    let response_style = lab.get("responseStyle").cloned().unwrap_or(Value::Null);
    let enabled = response_style
        .get("enabled")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);

    if !enabled {
        return default_identity_line();
    }

    if let Some(custom) = response_style
        .get("customPrompts")
        .and_then(|value| value.get("custom"))
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return custom.to_string();
    }

    let selected_key = response_style
        .get("selectedKey")
        .and_then(|value| value.as_str())
        .unwrap_or("normal")
        .trim();

    if selected_key == "normal" {
        return default_identity_line();
    }

    for (key, prompt) in RESPONSE_STYLE_PRESETS {
        if key == selected_key {
            return prompt.to_string();
        }
    }

    default_identity_line()
}

fn default_identity_line() -> String {
    "You are Coder, a helpful desktop AI assistant.".to_string()
}

fn load_settings_json() -> Value {
    let path = get_coder_data_dir().join("settings.json");
    if !path.exists() {
        return Value::Null;
    }

    std::fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or(Value::Null)
}
