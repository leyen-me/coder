import { isAutomationDue } from "./is-automation-due";
import { queueAutomationRun } from "./run-automation";
import { getStaleRunningRuns } from "@/lib/db/automation-runs";
import { finishAutomationRun } from "@/lib/db";

/** How often the scheduler checks for due automations (ms). */
export const SCHEDULER_INTERVAL_MS = 30_000;

let schedulerTimerId: ReturnType<typeof setInterval> | null = null;

/** Start the scheduler — called once when the app mounts. */
export function startAutomationScheduler(): void {
  if (schedulerTimerId !== null) {
    return;
  }

  void tick();
  schedulerTimerId = setInterval(tick, SCHEDULER_INTERVAL_MS);
}

/** Stop the scheduler — called when the app unmounts. */
export function stopAutomationScheduler(): void {
  if (schedulerTimerId !== null) {
    clearInterval(schedulerTimerId);
    schedulerTimerId = null;
  }
}

/** Check for due automations and execute them. */
async function tick(): Promise<void> {
  try {
    const { listEnabledAutomations } = await import("@/lib/db/automations");
    const automations = await listEnabledAutomations();

    for (const automation of automations) {
      for (const staleRun of getStaleRunningRuns(automation)) {
        await finishAutomationRun(automation.id, staleRun.sessionId, {
          summary: "[failed] Run interrupted before completion",
          status: "failed",
        });
      }
    }

    const refreshed = await listEnabledAutomations();

    for (const automation of refreshed) {
      if (isAutomationDue(automation)) {
        queueAutomationRun(automation);
      }
    }
  } catch (error) {
    console.error("[automation scheduler] tick failed:", error);
  }
}
