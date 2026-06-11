import { CronExpressionParser } from "cron-parser";
import type { AutomationRecord } from "@/lib/db";

/** View model for the automations list UI. */
export type AutomationViewModel = AutomationRecord & {
  /** Formatted relative time string (e.g. "2 hours ago"). */
  relativeTime: string;
  /** Whether the automation is currently being executed. */
  running: boolean;
};

/** Human-readable cron presets for the create/edit dialog. */
export type CronPreset = {
  label: string;
  expression: string;
};

export const CRON_PRESETS: CronPreset[] = [
  { label: "Every hour", expression: "0 * * * *" },
  { label: "Every 6 hours", expression: "0 */6 * * *" },
  { label: "Every day at midnight", expression: "0 0 * * *" },
  { label: "Every day at 9:00", expression: "0 9 * * *" },
  { label: "Every weekday at 9:00", expression: "0 9 * * 1-5" },
  { label: "Every Monday at 9:00", expression: "0 9 * * 1" },
  { label: "Every Sunday at 9:00", expression: "0 9 * * 0" },
  { label: "Every 1st of month at 9:00", expression: "0 9 1 * *" },
];

/** Validate a cron expression string. */
export function isValidCronExpression(expression: string): boolean {
  try {
    CronExpressionParser.parse(expression.trim());
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the number of minutes until the next scheduled run,
 * or null if the expression cannot be parsed.
 */
export function getMinutesUntilNextRun(expression: string): number | null {
  try {
    const parsed = CronExpressionParser.parse(expression.trim());
    const nextDate = parsed.next().toDate();
    const diffMs = nextDate.getTime() - Date.now();
    return Math.round(diffMs / 60000);
  } catch {
    return null;
  }
}
