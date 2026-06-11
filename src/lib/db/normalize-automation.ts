import type { AutomationRecord } from "./types";

/** Backfill run settings for automations created before v7. */
export function normalizeAutomationRecord(
  record: AutomationRecord
): AutomationRecord {
  return {
    ...record,
    workspaceDir: record.workspaceDir ?? null,
    model: record.model?.trim() ?? "",
    agentMode: record.agentMode === "ask" ? "ask" : "agent",
    thinkingEnabled: record.thinkingEnabled ?? false,
  };
}
