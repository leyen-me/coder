import {
  DEFAULT_MODEL_CONTEXT_WINDOW,
  findModelDefinition,
} from "@/lib/model-provider/model-definition";
import type { ResolvedProviderConfig } from "@/lib/model-provider/types";

/**
 * Shared helper moved here so agent-store
 * can resolve the context window without React dependency.
 */
export function resolveContextWindowForModel(
  resolved: ResolvedProviderConfig,
  modelId: string,
): number {
  return (
    findModelDefinition(resolved.models, modelId)?.contextWindow ??
    DEFAULT_MODEL_CONTEXT_WINDOW
  );
}
