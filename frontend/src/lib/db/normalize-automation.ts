import {
  inferAutomationRunStatus,
  trimAutomationRuns,
} from "./automation-runs";
import { stripWindowsVerbatimPrefix } from "@/lib/path";
import type { AutomationRecord, AutomationRunRecord } from "./types";
import { inferProviderFromModel } from "./normalize-session";
import type { ProviderId } from "@/lib/model-provider/types";

type LegacyAutomationRecord = {
  id: string;
  name: string;
  description: string;
  cronExpression: string;
  prompt: string;
  workspaceDir?: string | null;
  model?: string;
  provider?: string | null;
  agentMode?: AutomationRecord["agentMode"];
  thinkingEnabled?: boolean;
  enabled?: boolean;
  enableEmail?: boolean;
  runs?: AutomationRunRecord[];
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number | null;
  lastResultSummary?: string | null;
  lastSessionId?: string | null;
};

function migrateLegacyRuns(record: LegacyAutomationRecord): AutomationRunRecord[] {
  if (record.runs?.length) {
    return record.runs;
  }

  if (record.lastRunAt == null) {
    return [];
  }

  const sessionId = record.lastSessionId?.trim() || "";
  const summary = record.lastResultSummary?.trim() || "";

  return [
    {
      id: sessionId || crypto.randomUUID(),
      sessionId,
      startedAt: record.lastRunAt,
      completedAt: record.lastRunAt,
      summary,
      status: inferAutomationRunStatus(summary),
    },
  ];
}

/** Backfill run settings and run history for older automation records. */
export function normalizeAutomationRecord(
  record: LegacyAutomationRecord
): AutomationRecord {
  const {
    lastRunAt: _lastRunAt,
    lastResultSummary: _summary,
    lastSessionId: _sessionId,
    ...rest
  } = record;

  return {
    ...rest,
    provider: normalizeProviderField(record.provider, record.model ?? ""),
    workspaceDir: record.workspaceDir
      ? stripWindowsVerbatimPrefix(record.workspaceDir.trim()) || null
      : null,
    model: record.model?.trim() ?? "",
    agentMode: record.agentMode === "ask" ? "ask" : "agent",
    thinkingEnabled: record.thinkingEnabled ?? false,
    enabled: record.enabled ?? true,
    enableEmail: record.enableEmail ?? false,
    runs: trimAutomationRuns(migrateLegacyRuns(record)),
  };
}

function normalizeProviderField(
  provider: string | null | undefined,
  modelId: string
): ProviderId {
  if (!provider) {
    return inferProviderFromModel(null, modelId);
  }
  return provider as ProviderId;
}
