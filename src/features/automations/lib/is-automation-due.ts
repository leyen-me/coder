import { CronExpressionParser } from "cron-parser";

import type { AutomationRecord } from "@/lib/db";
import { getLastAutomationRunAt } from "@/lib/db/automation-runs";

/** Determine whether an automation is due to run on the next scheduler tick. */
export function isAutomationDue(automation: AutomationRecord): boolean {
  try {
    const interval = CronExpressionParser.parse(automation.cronExpression.trim());
    const now = new Date();
    const prev = interval.prev().toDate();
    const lastRunAt = getLastAutomationRunAt(automation);

    if (lastRunAt === null) {
      return prev.getTime() < now.getTime();
    }

    return prev.getTime() > lastRunAt;
  } catch {
    return false;
  }
}
