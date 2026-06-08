import {
  GLM_THINKING_CONFIG,
  normalizeThinkingConfig,
  type ModelThinkingConfig,
} from "./thinking-config";

export type { ModelThinkingConfig };

export type ModelDefinition = {
  id: string;
  label?: string;
  contextWindow: number;
  supportsThinking: boolean;
  supportsMultimodal: boolean;
  thinkingConfig?: ModelThinkingConfig;
};

export const DEFAULT_MODEL_CONTEXT_WINDOW = 200_000;

export function createModelDefinition(
  id: string,
  overrides: Partial<Omit<ModelDefinition, "id">> = {}
): ModelDefinition {
  return {
    id: id.trim(),
    label: overrides.label?.trim() || undefined,
    contextWindow: overrides.contextWindow ?? DEFAULT_MODEL_CONTEXT_WINDOW,
    supportsThinking: overrides.supportsThinking ?? false,
    supportsMultimodal: overrides.supportsMultimodal ?? false,
    thinkingConfig:
      overrides.thinkingConfig ??
      (overrides.supportsThinking === true
        ? {
            enabled: { ...GLM_THINKING_CONFIG.enabled },
            disabled: { ...GLM_THINKING_CONFIG.disabled },
            defaultEnabled: GLM_THINKING_CONFIG.defaultEnabled,
          }
        : undefined),
  };
}

export function normalizeModelDefinition(raw: unknown): ModelDefinition | null {
  if (typeof raw === "string") {
    const id = raw.trim();
    return id.length > 0 ? createModelDefinition(id) : null;
  }

  if (raw === null || raw === undefined || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";

  if (!id) {
    return null;
  }

  const contextWindow =
    typeof record.contextWindow === "number" &&
    Number.isFinite(record.contextWindow) &&
    record.contextWindow > 0
      ? Math.floor(record.contextWindow)
      : DEFAULT_MODEL_CONTEXT_WINDOW;

  return {
    id,
    label:
      typeof record.label === "string" && record.label.trim().length > 0
        ? record.label.trim()
        : undefined,
    contextWindow,
    supportsThinking: record.supportsThinking === true,
    supportsMultimodal: record.supportsMultimodal === true,
    thinkingConfig:
      normalizeThinkingConfig(record.thinkingConfig) ??
      (record.supportsThinking === true
        ? {
            enabled: { ...GLM_THINKING_CONFIG.enabled },
            disabled: { ...GLM_THINKING_CONFIG.disabled },
            defaultEnabled: GLM_THINKING_CONFIG.defaultEnabled,
          }
        : undefined),
  };
}

export function parseModelDefinitions(value: unknown): ModelDefinition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const models: ModelDefinition[] = [];

  for (const item of value) {
    const model = normalizeModelDefinition(item);
    if (!model || seen.has(model.id)) {
      continue;
    }

    seen.add(model.id);
    models.push(model);
  }

  return models;
}

export function getModelDisplayName(model: ModelDefinition): string {
  return model.label ?? model.id;
}

export function findModelDefinition(
  models: readonly ModelDefinition[],
  id: string
): ModelDefinition | undefined {
  return models.find((model) => model.id === id);
}

export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000;
    return Number.isInteger(millions) ? `${millions}M` : `${millions.toFixed(1)}M`;
  }

  if (tokens >= 1_000) {
    const thousands = tokens / 1_000;
    return Number.isInteger(thousands) ? `${thousands}K` : `${thousands.toFixed(1)}K`;
  }

  return String(tokens);
}
