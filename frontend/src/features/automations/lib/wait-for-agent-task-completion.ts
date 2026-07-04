import { getAgentStatus } from "@/features/agent/runner";
import { appEventBus } from "@/lib/event-bus";

export type AgentTerminalStatus = "completed" | "failed" | "cancelled";

const POLL_INTERVAL_MS = 500;
const COMPLETION_TIMEOUT_MS = 30 * 60 * 1000;

function isTerminalStatus(
  status: string | undefined
): status is AgentTerminalStatus {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export type AgentTaskCompletionBuffer = {
  take(taskId: string): AgentTerminalStatus | undefined;
  dispose(): void;
};

/** Capture task completion events while sendMessage is still in flight. */
export function createAgentTaskCompletionBuffer(): AgentTaskCompletionBuffer {
  const earlyCompletions = new Map<string, AgentTerminalStatus>();
  const unsub = appEventBus.on("agent:task_completed", (event) => {
    earlyCompletions.set(event.taskId, event.status);
  });

  return {
    take(taskId: string): AgentTerminalStatus | undefined {
      return earlyCompletions.get(taskId);
    },
    dispose() {
      unsub();
    },
  };
}

export async function waitForAgentTaskCompletion(
  taskId: string,
  buffer?: AgentTaskCompletionBuffer
): Promise<AgentTerminalStatus> {
  const bufferedStatus = buffer?.take(taskId);
  if (bufferedStatus) {
    return bufferedStatus;
  }

  return new Promise((resolve) => {
    let settled = false;
    const startedAt = Date.now();

    const finish = (status: AgentTerminalStatus) => {
      if (settled) {
        return;
      }
      settled = true;
      unsub();
      resolve(status);
    };

    const unsub = appEventBus.on("agent:task_completed", (event) => {
      if (event.taskId === taskId) {
        finish(event.status);
      }
    });

    const poll = async () => {
      if (settled) {
        return;
      }

      const fromBuffer = buffer?.take(taskId);
      if (fromBuffer) {
        finish(fromBuffer);
        return;
      }

      try {
        const response = await getAgentStatus(taskId);
        if (isTerminalStatus(response?.status)) {
          finish(response.status);
          return;
        }
      } catch {
        // Best effort — keep polling until timeout.
      }

      if (Date.now() - startedAt >= COMPLETION_TIMEOUT_MS) {
        finish("failed");
        return;
      }

      setTimeout(() => {
        void poll();
      }, POLL_INTERVAL_MS);
    };

    void poll();
  });
}
