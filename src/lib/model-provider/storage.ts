import {
  DEFAULT_MODEL_PROVIDER_SETTINGS,
  MODEL_PROVIDER_STORAGE_KEY,
} from "./constants";
import { parseModelProviderSettings } from "./parse-model-provider-settings";
import type { ModelProviderSettings } from "./types";

export function readModelProviderSettings(): ModelProviderSettings {
  if (typeof localStorage === "undefined") {
    return DEFAULT_MODEL_PROVIDER_SETTINGS;
  }

  try {
    const raw = localStorage.getItem(MODEL_PROVIDER_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_MODEL_PROVIDER_SETTINGS;
    }

    return parseModelProviderSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_MODEL_PROVIDER_SETTINGS;
  }
}

export function writeModelProviderSettings(
  settings: ModelProviderSettings
): void {
  localStorage.setItem(MODEL_PROVIDER_STORAGE_KEY, JSON.stringify(settings));
}
