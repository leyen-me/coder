import { apiPost } from "@/lib/api/client";
import { connectAgentSse } from "@/lib/api/sse";
import type { AgentEvent, AgentStartInput } from "./types";

export async function startAgent(
  input: AgentStartInput,
  onEvent: (event: AgentEvent) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let didStart = false;
    let didFinishStream = false;
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      callback();
    };
    const maybeResolve = () => {
      if (didStart && didFinishStream) {
        settle(resolve);
      }
    };
    const connection = connectAgentSse(
      input.taskId,
      (raw) => {
        onEvent(raw as AgentEvent);
      },
      () => {
        didFinishStream = true;
        maybeResolve();
      },
      (error) => settle(() => reject(new Error(error))),
    );

    void connection.ready
      .then(async () => {
        await apiPost("/agent/start", {
          taskId: input.taskId,
          baseUrl: input.baseUrl,
          apiKey: input.apiKey || null,
          apiKeySource: input.apiKeySource,
          apiKeyEnvVar: input.apiKeyEnvVar,
          model: input.model,
          messages: input.messages,
          tools: input.tools ?? null,
          requestExtensions: input.requestExtensions ?? null,
        });
        didStart = true;
        maybeResolve();
      })
      .catch((error: unknown) => {
        connection.close();
        settle(() =>
          reject(error instanceof Error ? error : new Error(String(error)))
        );
      });
  });
}

export async function cancelAgent(taskId: string): Promise<void> {
  try {
    await apiPost("/agent/cancel", { taskId });
  } catch {
    // best effort
  }
}

export async function getAgentStatus(
  taskId: string,
): Promise<{ taskId: string; status: string } | null> {
  try {
    return await apiPost("/agent/status", { taskId });
  } catch {
    return null;
  }
}
