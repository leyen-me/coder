import { useEffect, useRef } from "react";

import { observeExternalAgentRun } from "@/features/agent/store/agent-store";
import { listActiveScheduledRuns } from "@/features/scheduled-jobs/lib/api";
import { appEventBus } from "@/lib/event-bus";

const POLL_INTERVAL_MS = 2_000;

function buildActiveRunKey(
  runs: Awaited<ReturnType<typeof listActiveScheduledRuns>>
): string {
  return runs
    .map((run) => `${run.jobId}:${run.taskId}`)
    .sort()
    .join("|");
}

export function ScheduledJobStreamBridge() {
  const previousRunKeyRef = useRef("");

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (cancelled) {
        return;
      }

      try {
        const runs = await listActiveScheduledRuns();
        const runKey = buildActiveRunKey(runs);
        if (runKey !== previousRunKeyRef.current) {
          if (previousRunKeyRef.current || runs.length > 0) {
            appEventBus.emit("sessions:external_changed", {});
          }
          previousRunKeyRef.current = runKey;
        }

        for (const run of runs) {
          observeExternalAgentRun({
            taskId: run.taskId,
            sessionId: run.sessionId,
            assistantMessageId: run.assistantMessageId,
          });
        }
      } catch (error) {
        console.warn("[ScheduledJobStreamBridge] poll failed", error);
      }
    };

    void poll();
    const intervalId = window.setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  return null;
}
