import type { AutomationRecord, AutomationRunRecord } from "./types";

export const MAX_AUTOMATION_RUNS = 50;

export function inferAutomationRunStatus(
  summary: string
): AutomationRunRecord["status"] {
  const normalized = summary.trim().toLowerCase();
  if (normalized.startsWith("[failed]") || normalized.startsWith("[error]")) {
    return "failed";
  }
  if (normalized.startsWith("[cancelled]")) {
    return "cancelled";
  }
  return "completed";
}

export function getLastAutomationRunAt(
  automation: AutomationRecord
): number | null {
  const finishedRuns = automation.runs.filter((run) => run.status !== "running");
  if (finishedRuns.length === 0) {
    return null;
  }

  return Math.max(
    ...finishedRuns.map((run) => run.completedAt ?? run.startedAt)
  );
}

export function trimAutomationRuns(
  runs: AutomationRunRecord[]
): AutomationRunRecord[] {
  return runs.slice(0, MAX_AUTOMATION_RUNS);
}
