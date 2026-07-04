import { resolveDefaultModel } from "@/features/agent/model-preference";
import { readWorkspaceDir } from "@/features/workspace/storage";
import { findModelDefinition } from "@/lib/model-provider/model-definition";
import type { ResolvedProviderConfig } from "@/lib/model-provider/types";
import type { AutomationRecord } from "@/lib/db";

export type ResolvedAutomationRunConfig = {
  workspaceDir: string | null;
  model: string;
  provider: string;
  agentMode: AutomationRecord["agentMode"];
  thinkingEnabled: boolean;
};

export function resolveAutomationRunConfig(
  automation: AutomationRecord,
  resolved: Pick<ResolvedProviderConfig, "models">
): ResolvedAutomationRunConfig {
  const trimmedModel = automation.model.trim();
  const model =
    trimmedModel && findModelDefinition(resolved.models, trimmedModel)
      ? trimmedModel
      : resolveDefaultModel(resolved);

  const modelDefinition = findModelDefinition(resolved.models, model);
  const thinkingEnabled =
    automation.thinkingEnabled &&
    Boolean(modelDefinition?.supportsThinking && modelDefinition.thinkingConfig);

  return {
    workspaceDir:
      automation.workspaceDir?.trim() || readWorkspaceDir()?.trim() || null,
    model,
    provider: automation.provider,
    agentMode: automation.agentMode,
    thinkingEnabled,
  };
}
