import {
  inferAutomationRunStatus,
  trimAutomationRuns,
} from "./automation-runs";
import type { AutomationRecord, AutomationRunRecord } from "./types";

type LegacyAutomationRecord = AutomationRecord & {
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
    workspaceDir: record.workspaceDir ?? null,
    model: record.model?.trim() ?? "",
    agentMode: record.agentMode === "ask" ? "ask" : "agent",
    thinkingEnabled: record.thinkingEnabled ?? false,
    runs: trimAutomationRuns(migrateLegacyRuns(record)),
  };
}
