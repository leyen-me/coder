import { Channel, invoke, isTauri } from "@tauri-apps/api/core";

import { cancelBrowserAgent, startBrowserAgent } from "./browser-runner";
import type { AgentEvent, AgentStartInput } from "./types";

type TauriAgentStatus =
  | "pending"
  | "running"
  | "cancelling"
  | "cancelled"
  | "completed"
  | "failed";

type TauriToolCall = {
  id: string;
  name: string;
  arguments: string;
};

type TauriAgentEvent =
  | { type: "status"; taskId: string; status: TauriAgentStatus }
  | { type: "thinkingDelta"; taskId: string; delta: string }
  | { type: "contentDelta"; taskId: string; delta: string }
  | { type: "toolCallPending"; taskId: string; toolCallId: string; name: string }
  | { type: "turnComplete"; taskId: string; toolCalls: TauriToolCall[] }
  | { type: "done"; taskId: string }
  | { type: "error"; taskId: string; message: string };

function mapTauriEvent(event: TauriAgentEvent): AgentEvent {
  switch (event.type) {
    case "status":
      return { type: "status", taskId: event.taskId, status: event.status };
    case "thinkingDelta":
      return { type: "thinking_delta", taskId: event.taskId, delta: event.delta };
    case "contentDelta":
      return { type: "content_delta", taskId: event.taskId, delta: event.delta };
    case "toolCallPending":
      return {
        type: "tool_call_pending",
        taskId: event.taskId,
        toolCallId: event.toolCallId,
        name: event.name,
      };
    case "turnComplete":
      return {
        type: "turn_complete",
        taskId: event.taskId,
        toolCalls: event.toolCalls,
      };
    case "done":
      return { type: "done", taskId: event.taskId };
    case "error":
      return { type: "error", taskId: event.taskId, message: event.message };
  }
}

export async function startAgent(
  input: AgentStartInput,
  onEvent: (event: AgentEvent) => void
): Promise<void> {
  if (isTauri()) {
    const channel = new Channel<TauriAgentEvent>();
    channel.onmessage = (event) => {
      onEvent(mapTauriEvent(event));
    };

    await invoke("agent_start", {
      params: {
        taskId: input.taskId,
        baseUrl: input.baseUrl,
        apiKey: input.apiKey || null,
        apiKeySource: input.apiKeySource,
        apiKeyEnvVar: input.apiKeyEnvVar,
        model: input.model,
        messages: input.messages,
        tools: input.tools ?? null,
        requestExtensions: input.requestExtensions ?? null,
      },
      onEvent: channel,
    });
    return;
  }

  await startBrowserAgent(input, onEvent);
}

export async function cancelAgent(taskId: string): Promise<void> {
  if (isTauri()) {
    try {
      await invoke("shell_kill_by_task", { taskId });
    } catch {
      // Best-effort cleanup for background shell processes.
    }
    try {
      await invoke("agent_cancel", { taskId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Task not found")) {
        throw error;
      }
    }
    return;
  }

  await cancelBrowserAgent(taskId);
}

export async function getAgentStatus(
  taskId: string
): Promise<{ taskId: string; status: TauriAgentStatus } | null> {
  if (!isTauri()) {
    return null;
  }

  return invoke("agent_get_status", { taskId });
}
