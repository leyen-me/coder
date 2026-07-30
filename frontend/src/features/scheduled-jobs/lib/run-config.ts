import { readWorkspaceDir } from "@/features/workspace/storage";
import {
  findModelEntry,
  parseModelValue,
  type ModelProviderEntry,
} from "@/lib/model-provider/resolve-provider-config";

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
  entries: ModelProviderEntry[]
): ResolvedScheduledJobRunConfig {
  const entry = findModelEntry(entries, job.model) ?? entries[0];
  const model = entry?.value ?? job.model;
  const modelDefinition = entry?.model;
  const { providerId } = parseModelValue(job.model);
  const thinkingEnabled =
    job.thinkingEnabled &&
    Boolean(modelDefinition?.supportsThinking && modelDefinition.thinkingConfig);

  return {
    workspaceDir: job.workspaceDir?.trim() || readWorkspaceDir()?.trim() || null,
    model,
    provider: providerId || job.provider,
    agentMode: job.agentMode,
    thinkingEnabled,
  };
}
