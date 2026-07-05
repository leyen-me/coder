import { resolveDefaultModel } from "@/features/agent/model-preference";
import { readWorkspaceDir } from "@/features/workspace/storage";
import { findModelDefinition } from "@/lib/model-provider/model-definition";
import type { ResolvedProviderConfig } from "@/lib/model-provider/types";

import type { ScheduledJobRecord } from "./api";

export type ResolvedScheduledJobRunConfig = {
  workspaceDir: string | null;
  model: string;
  provider: string;
  agentMode: ScheduledJobRecord["agentMode"];
  thinkingEnabled: boolean;
};

export function resolveScheduledJobRunConfig(
  job: ScheduledJobRecord,
  resolved: Pick<ResolvedProviderConfig, "models">,
): ResolvedScheduledJobRunConfig {
  const trimmedModel = job.model.trim();
  const model =
    trimmedModel && findModelDefinition(resolved.models, trimmedModel)
      ? trimmedModel
      : resolveDefaultModel(resolved);

  const modelDefinition = findModelDefinition(resolved.models, model);
  const thinkingEnabled =
    job.thinkingEnabled &&
    Boolean(modelDefinition?.supportsThinking && modelDefinition.thinkingConfig);

  return {
    workspaceDir:
      job.workspaceDir?.trim() || readWorkspaceDir()?.trim() || null,
    model,
    provider: job.provider,
    agentMode: job.agentMode,
    thinkingEnabled,
  };
}
