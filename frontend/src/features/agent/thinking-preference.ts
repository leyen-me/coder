import { getKVStore } from "@/lib/storage";
import { findModelDefinition } from "@/lib/model-provider/model-definition";
import type { ModelDefinition } from "@/lib/model-provider/types";
import {
  resolveThinkingRequestParams,
  type ModelThinkingConfig,
} from "@/lib/model-provider/thinking-config";

const THINKING_PREFERENCES_KEY = "coder:model-thinking-preferences";

function readPreferences(): Record<string, boolean> {
  try {
    const raw = getKVStore().getItem(THINKING_PREFERENCES_KEY);
    if (!raw) {
      return {};
    }

    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const result: Record<string, boolean> = {};
    for (const [modelId, value] of Object.entries(parsed)) {
      if (typeof value === "boolean") {
        result[modelId] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function writePreferences(preferences: Record<string, boolean>): void {
  getKVStore().setItem(THINKING_PREFERENCES_KEY, JSON.stringify(preferences));
}

export function readThinkingPreference(modelId: string): boolean | null {
  const value = readPreferences()[modelId.trim()];
  return typeof value === "boolean" ? value : null;
}

export function writeThinkingPreference(
  modelId: string,
  enabled: boolean
): void {
  const trimmed = modelId.trim();
  if (!trimmed) {
    return;
  }

  writePreferences({
    ...readPreferences(),
    [trimmed]: enabled,
  });
}

export function resolveDefaultThinkingEnabled(
  model: ModelDefinition | undefined
): boolean {
  if (!model?.supportsThinking || !model.thinkingConfig) {
    return false;
  }

  const remembered = readThinkingPreference(model.id);
  if (remembered !== null) {
    return remembered;
  }

  return model.thinkingConfig.defaultEnabled ?? true;
}

export function canToggleThinking(model: ModelDefinition | undefined): boolean {
  return Boolean(model?.supportsThinking && model.thinkingConfig);
}

export function buildThinkingRequestExtensions(input: {
  models: readonly ModelDefinition[];
  modelId: string;
  thinkingEnabled: boolean;
}): Record<string, unknown> | undefined {
  const model = findModelDefinition(input.models, input.modelId);
  if (!canToggleThinking(model)) {
    return undefined;
  }

  return resolveThinkingRequestParams(
    model?.thinkingConfig as ModelThinkingConfig | undefined,
    input.thinkingEnabled
  );
}
