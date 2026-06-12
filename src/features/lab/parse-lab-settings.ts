import {
  DEFAULT_LAB_SETTINGS,
  DEFAULT_REFINE_PROMPT_SYSTEM_PROMPT,
} from "./constants";
import type { LabSettings } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

  return {
    promptRefineEnabled,
    promptRefineSystemPrompt,
  };
}
