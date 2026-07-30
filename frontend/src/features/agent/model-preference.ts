import { getKVStore } from "@/lib/storage";
import {
  getDefaultApiKeyEnvVar,
  isPresetProvider,
  PRESET_PROVIDERS,
} from "@/lib/model-provider/constants";
import { findModelDefinition } from "@/lib/model-provider/model-definition";
import type { ModelDefinition, ResolvedProviderConfig } from "@/lib/model-provider/types";

export const LAST_SELECTED_MODEL_KEY = "coder:last-selected-model";

export function readLastSelectedModel(): string | null {
  const value = getKVStore().getItem(LAST_SELECTED_MODEL_KEY);
  return value?.trim() || null;
}

export function writeLastSelectedModel(model: string): void {
  getKVStore().setItem(LAST_SELECTED_MODEL_KEY, model.trim());
}

export function resolveDefaultModel(
  resolved: Pick<ResolvedProviderConfig, "models">
): string {
  const remembered = readLastSelectedModel();
  if (remembered && findModelDefinition(resolved.models, remembered)) {
    return remembered;
  }

  return resolved.models[0]?.id ?? "";
}

export function resolveApiKey(resolved: ResolvedProviderConfig): string {
  if (resolved.apiKeySource === "manual") {
    return resolved.apiKey.trim();
  }

  return "";
}

export function resolveApiKeyEnvVar(resolved: ResolvedProviderConfig): string {
  if (resolved.apiKeyEnvVar.trim()) {
    return resolved.apiKeyEnvVar.trim();
  }

  if (isPresetProvider(resolved.provider)) {
    return PRESET_PROVIDERS[resolved.provider].defaultApiKeyEnvVar;
  }

  return getDefaultApiKeyEnvVar(resolved.provider);
}

export function resolveSelectedModelDefinition(
  models: readonly ModelDefinition[],
  modelId: string
): ModelDefinition | undefined {
  return findModelDefinition(models, modelId);
}
