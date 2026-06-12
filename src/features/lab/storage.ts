import {
  DEFAULT_LAB_SETTINGS,
  LAB_STORAGE_KEY,
  LEGACY_PROMPT_REFINE_ENABLED_KEY,
} from "./constants";
import { parseLabSettings } from "./parse-lab-settings";
import type { LabSettings } from "./types";

function readLegacyPromptRefineEnabled(): boolean | null {
  if (typeof localStorage === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(LEGACY_PROMPT_REFINE_ENABLED_KEY);
    if (raw === null) {
      return null;
    }
    return raw === "true";
  } catch {
    return null;
  }
}

export function readLabSettings(): LabSettings {
  if (typeof localStorage === "undefined") {
    return DEFAULT_LAB_SETTINGS;
  }

  try {
    const raw = localStorage.getItem(LAB_STORAGE_KEY);
    if (raw) {
      return parseLabSettings(JSON.parse(raw));
    }

    const legacyEnabled = readLegacyPromptRefineEnabled();
    if (legacyEnabled === null) {
      return DEFAULT_LAB_SETTINGS;
    }

    return {
      ...DEFAULT_LAB_SETTINGS,
      promptRefineEnabled: legacyEnabled,
    };
  } catch {
    return DEFAULT_LAB_SETTINGS;
  }
}

export function writeLabSettings(settings: LabSettings): void {
  localStorage.setItem(LAB_STORAGE_KEY, JSON.stringify(settings));
}

export function resolvePromptRefineSystemPrompt(settings: LabSettings): string {
  return settings.promptRefineSystemPrompt.trim() || DEFAULT_LAB_SETTINGS.promptRefineSystemPrompt;
}
