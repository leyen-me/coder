import { CronExpressionParser } from "cron-parser";

import type { AutomationRecord } from "@/lib/db";
import { getLastAutomationRunAt } from "@/lib/db/automation-runs";

/** Determine whether an automation is due to run on the next scheduler tick. */
export function isAutomationDue(automation: AutomationRecord): boolean {
  if (automation.runs.some((run) => run.status === "running")) {
    return false;
  }

  try {
    const interval = CronExpressionParser.parse(
      automation.cronExpression.trim(),
    );
    const prev = interval.prev().toDate();
    const lastRunAt = getLastAutomationRunAt(automation);

    if (lastRunAt === null) {
      // Never run — use creation time as the reference point so we don't
      // fire before the first scheduled occurrence. An automation created
      // just now should wait for its first cron tick, not catch up on past ones.
      return prev.getTime() > automation.createdAt;
    }

    return prev.getTime() > lastRunAt;
  } catch {
    return false;
  }
}
