import {
  DEFAULT_LAB_SETTINGS,
  DEFAULT_REFINE_PROMPT_SYSTEM_PROMPT,
  DEFAULT_RESPONSE_STYLE_CONFIG,
  RESPONSE_STYLE_PRESETS,
} from "./constants";
import type { LabSettings, ResponseStyleConfig } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseResponseStyle(value: unknown): ResponseStyleConfig {
  if (!isRecord(value)) {
    return DEFAULT_RESPONSE_STYLE_CONFIG;
  }

  const enabled =
    typeof value.enabled === "boolean"
      ? value.enabled
      : DEFAULT_RESPONSE_STYLE_CONFIG.enabled;

  const selectedKey =
    typeof value.selectedKey === "string" &&
    RESPONSE_STYLE_PRESETS.some((p) => p.key === value.selectedKey)
      ? value.selectedKey
      : DEFAULT_RESPONSE_STYLE_CONFIG.selectedKey;

  const customPrompts: Record<string, string> =
    isRecord(value.customPrompts)
      ? Object.fromEntries(
          Object.entries(value.customPrompts).filter(
            (entry): entry is [string, string] =>
              typeof entry[1] === "string"
          )
        )
      : { ...DEFAULT_RESPONSE_STYLE_CONFIG.customPrompts };

  return { enabled, selectedKey, customPrompts };
}

export function parseLabSettings(value: unknown): LabSettings {
  if (!isRecord(value)) {
    return DEFAULT_LAB_SETTINGS;
  }

  const promptRefineEnabled =
    typeof value.promptRefineEnabled === "boolean"
      ? value.promptRefineEnabled
      : DEFAULT_LAB_SETTINGS.promptRefineEnabled;

  const promptRefineSystemPrompt =
    typeof value.promptRefineSystemPrompt === "string" &&
    value.promptRefineSystemPrompt.trim().length > 0
      ? value.promptRefineSystemPrompt
      : DEFAULT_REFINE_PROMPT_SYSTEM_PROMPT;

  const responseStyle = parseResponseStyle(value.responseStyle);

  return {
    promptRefineEnabled,
    promptRefineSystemPrompt,
    responseStyle,
  };
}
