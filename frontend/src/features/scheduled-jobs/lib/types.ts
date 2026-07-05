import { CronExpressionParser } from "cron-parser";

import type { ScheduledJobRecord } from "./api";
import type { MessageKey } from "@/lib/i18n/messages";

/** View model for the automations list UI. */
export type ScheduledJobViewModel = ScheduledJobRecord & {
  relativeTime: string;
  running: boolean;
};

/** Human-readable cron presets for the create/edit dialog. */
export type CronPreset = {
  labelKey: MessageKey;
  expression: string;
};

export const CRON_PRESETS = [
  { labelKey: "automations.presets.everyHour", expression: "0 * * * *" },
  { labelKey: "automations.presets.every6Hours", expression: "0 */6 * * *" },
  { labelKey: "automations.presets.everyDayMidnight", expression: "0 0 * * *" },
  { labelKey: "automations.presets.everyDay9", expression: "0 9 * * *" },
  { labelKey: "automations.presets.everyWeekday9", expression: "0 9 * * 1-5" },
  { labelKey: "automations.presets.everyMonday9", expression: "0 9 * * 1" },
  { labelKey: "automations.presets.everySunday9", expression: "0 9 * * 0" },
  { labelKey: "automations.presets.everyFirstOfMonth9", expression: "0 9 1 * *" },
] as const satisfies readonly CronPreset[];

export function isValidCronExpression(expression: string): boolean {
  try {
    CronExpressionParser.parse(expression.trim());
    return true;
  } catch {
    return false;
  }
}

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

export type { ScheduledJobRecord, ScheduledJobRunRecord } from "./api";
export type {
  CreateScheduledJobInput,
  UpdateScheduledJobInput,
  ScheduledJobAgentMode,
  ScheduledJobRunStatus,
} from "./api";
