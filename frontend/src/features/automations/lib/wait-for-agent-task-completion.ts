import { getAgentStatus } from "@/features/agent/runner";
import { appEventBus } from "@/lib/event-bus";

export type AgentTerminalStatus = "completed" | "failed" | "cancelled";

function isTerminalStatus(
  status: string | undefined
): status is AgentTerminalStatus {
  return status === "completed" || status === "failed" || status === "cancelled";
}

/** Capture task completion events while sendMessage is still in flight. */
export function createAgentTaskCompletionBuffer() {
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
  bufferedStatus?: AgentTerminalStatus
): Promise<AgentTerminalStatus> {
  if (bufferedStatus) {
    return bufferedStatus;
  }

  return new Promise((resolve) => {
    let settled = false;

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

    void getAgentStatus(taskId).then((response) => {
      if (isTerminalStatus(response?.status)) {
        finish(response.status);
      }
    });
  });
}
