import { apiPost } from "@/lib/api/client";
import { connectAgentSse } from "@/lib/api/sse";
import type { AgentEvent, AgentStartInput } from "./types";

export async function startAgent(
  input: AgentStartInput,
  onEvent: (event: AgentEvent) => void,
): Promise<void> {
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

  return new Promise<void>((resolve, reject) => {
    connectAgentSse(
      input.taskId,
      (raw) => {
        onEvent(raw as AgentEvent);
      },
      () => resolve(),
      (error) => reject(new Error(error)),
    );
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
