import { apiGet, apiPost } from "@/lib/api/client";
import { connectAgentSse, type AgentSseConnection } from "@/lib/api/sse";
import type { AgentEvent, AgentStartInput, AgentStatus } from "./types";

const activeConnections = new Map<string, AgentSseConnection>();

type StartAgentOptions = {
  signal?: AbortSignal;
};

function isTerminalStatus(status: string | null | undefined): status is AgentStatus {
  return status === "completed" || status === "cancelled" || status === "failed";
}

/** Close any in-flight SSE for this task before opening a replacement. */
function replaceActiveConnection(
  taskId: string,
  connection: AgentSseConnection,
): void {
  const previous = activeConnections.get(taskId);
  if (previous && previous !== connection) {
    previous.close();
  }
  activeConnections.set(taskId, connection);
}

function createAbortError(taskId: string): Error {
  const error = new Error(`Agent start aborted for task: ${taskId}`);
  error.name = "AbortError";
  return error;
}

export async function startAgent(
  input: AgentStartInput,
  onEvent: (event: AgentEvent) => void,
  options: StartAgentOptions = {},
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let didStart = false;
    let didFinishStream = false;
    let terminalStatus: AgentStatus | null = null;
    let recoveryInFlight = false;
    let settled = false;
    let detachAbortListener = () => {};
    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      activeConnections.delete(input.taskId);
      detachAbortListener();
      callback();
    };
    const maybeFinalize = () => {
      if (!didStart || !didFinishStream) {
        return;
      }

      if (terminalStatus) {
        settle(resolve);
        return;
      }

      if (recoveryInFlight) {
        return;
      }

      recoveryInFlight = true;
      void getAgentStatus(input.taskId)
        .then((statusResponse) => {
          if (settled) {
            return;
          }

          const recoveredStatus = statusResponse?.status;
          if (isTerminalStatus(recoveredStatus)) {
            terminalStatus = recoveredStatus;
            onEvent({
              type: "status",
              taskId: input.taskId,
              status: recoveredStatus,
            });
            settle(resolve);
            return;
          }

          const detail =
            typeof recoveredStatus === "string"
              ? ` Last known status: ${recoveredStatus}.`
              : "";
          const message = `Agent stream ended before a terminal status event was received.${detail}`;
          onEvent({ type: "error", taskId: input.taskId, message });
          settle(() => reject(new Error(message)));
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : String(error);
          settle(
            () =>
              reject(
                new Error(
                  `Agent stream ended before a terminal status event was received and status recovery failed: ${message}`
                )
              )
          );
        });
    };
    const connection = connectAgentSse(
      input.taskId,
      (raw) => {
        const event = raw as AgentEvent;
        if (event.type === "status" && isTerminalStatus(event.status)) {
          terminalStatus = event.status;
        }
        onEvent(event);
      },
      () => {
        didFinishStream = true;
        maybeFinalize();
      },
      (error) => settle(() => reject(new Error(error))),
      { fromSeq: 0 },
    );
    replaceActiveConnection(input.taskId, connection);

    if (options.signal) {
      if (options.signal.aborted) {
        connection.close();
        settle(() => reject(createAbortError(input.taskId)));
        return;
      }

      const onAbort = () => {
        connection.close();
        settle(() => reject(createAbortError(input.taskId)));
      };
      detachAbortListener = () => {
        options.signal?.removeEventListener("abort", onAbort);
      };
      options.signal.addEventListener("abort", onAbort, { once: true });
    }

    void connection.ready
      .then(async () => {
        if (options.signal?.aborted) {
          throw createAbortError(input.taskId);
        }
        await apiPost("/api/agent/start", {
          taskId: input.taskId,
          sessionId: input.sessionId ?? null,
          baseUrl: input.baseUrl,
          apiKey: input.apiKey || null,
          apiKeySource: input.apiKeySource,
          apiKeyEnvVar: input.apiKeyEnvVar,
          model: input.model,
          messages: input.messages,
          tools: input.tools ?? null,
          requestExtensions: input.requestExtensions ?? null,
          emitAssistantOutput: input.emitAssistantOutput ?? true,
          maxContextTokens: input.maxContextTokens ?? null,
          compactTriggerThreshold: input.compactTriggerThreshold ?? null,
          agentMode: input.agentMode ?? null,
          thinkingEnabled: input.thinkingEnabled ?? null,
          models: input.models ?? null,
          sessionKind: input.sessionKind ?? null,
          autonomyMode: input.autonomyMode ?? null,
          decisionPolicyVersion: input.decisionPolicyVersion ?? null,
          decisionModel: input.decisionModel ?? null,
        });
        didStart = true;
        maybeFinalize();
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
  // Keep the SSE connection open so the cancelled terminal status can arrive.
  // Closing early leaves the UI stuck in "cancelling".
  try {
    await apiPost("/api/agent/cancel", { taskId });
  } catch {
    // best effort — task may already have finished and been removed
  }
}

export async function getAgentStatus(
  taskId: string,
): Promise<{ taskId: string; status: string; lastSeq?: number | null } | null> {
  try {
    return await apiPost("/api/agent/status", { taskId });
  } catch {
    return null;
  }
}

export async function getAgentSessionStatus(
  sessionId: string,
): Promise<
  | {
      running: boolean;
      taskId?: string;
      status?: string;
      lastSeq?: number | null;
    }
  | null
> {
  try {
    return await apiGet(`/api/agent/session/${encodeURIComponent(sessionId)}/status`);
  } catch {
    return null;
  }
}

export async function sendAgentMessage(input: {
  sessionId: string;
  content: string;
  images?: Array<{
    id: string;
    filename?: string;
    mediaType?: string;
    url: string;
  }>;
  editMessageId?: string;
  referencedSkills?: string[];
  /** Per-session MCP attachment (on-demand model); persisted as a send fallback. */
  attachedMcpServers?: string[];
  baseUrl: string;
  apiKey: string;
  apiKeySource: "manual" | "env";
  apiKeyEnvVar: string;
  model: string;
  requestExtensions?: Record<string, unknown>;
  maxContextTokens?: number;
  compactTriggerThreshold?: number;
  agentMode?: string;
  thinkingEnabled?: boolean;
  models?: readonly unknown[];
  extraTools?: unknown[];
}): Promise<{
  userMessageId: string;
  assistantMessageId: string;
  taskId: string;
  deletedMessageIds?: string[];
}> {
  return apiPost("/api/agent/send", {
    sessionId: input.sessionId,
    content: input.content,
    images: input.images ?? null,
    editMessageId: input.editMessageId ?? null,
    referencedSkills: input.referencedSkills ?? null,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey || null,
    apiKeySource: input.apiKeySource,
    apiKeyEnvVar: input.apiKeyEnvVar,
    model: input.model,
    requestExtensions: input.requestExtensions ?? null,
    maxContextTokens: input.maxContextTokens ?? null,
    compactTriggerThreshold: input.compactTriggerThreshold ?? null,
    agentMode: input.agentMode ?? null,
    thinkingEnabled: input.thinkingEnabled ?? null,
    models: input.models ?? null,
    extraTools: input.extraTools ?? null,
    attachedMcpServers: input.attachedMcpServers ?? null,
  });
}

export async function regenerateAgentMessage(input: {
  sessionId: string;
  assistantMessageId: string;
  baseUrl: string;
  apiKey: string;
  apiKeySource: "manual" | "env";
  apiKeyEnvVar: string;
  model: string;
  requestExtensions?: Record<string, unknown>;
  maxContextTokens?: number;
  compactTriggerThreshold?: number;
  agentMode?: string;
  thinkingEnabled?: boolean;
  models?: readonly unknown[];
  extraTools?: unknown[];
}): Promise<{
  userMessageId: string;
  assistantMessageId: string;
  taskId: string;
  deletedMessageIds?: string[];
}> {
  return apiPost("/api/agent/regenerate", {
    sessionId: input.sessionId,
    assistantMessageId: input.assistantMessageId,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey || null,
    apiKeySource: input.apiKeySource,
    apiKeyEnvVar: input.apiKeyEnvVar,
    model: input.model,
    requestExtensions: input.requestExtensions ?? null,
    maxContextTokens: input.maxContextTokens ?? null,
    compactTriggerThreshold: input.compactTriggerThreshold ?? null,
    agentMode: input.agentMode ?? null,
    thinkingEnabled: input.thinkingEnabled ?? null,
    models: input.models ?? null,
    extraTools: input.extraTools ?? null,
  });
}

export async function resumeAgentStream(
  taskId: string,
  onEvent: (event: AgentEvent) => void,
  options: StartAgentOptions & { fromSeq?: number } = {},
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let terminalStatus: AgentStatus | null = null;
    let settled = false;
    let detachAbortListener = () => {};
    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      activeConnections.delete(taskId);
      detachAbortListener();
      callback();
    };
    const connection = connectAgentSse(
      taskId,
      (raw) => {
        const event = raw as AgentEvent;
        if (event.type === "status" && isTerminalStatus(event.status)) {
          terminalStatus = event.status;
        }
        onEvent(event);
      },
      () => {
        if (terminalStatus) {
          settle(resolve);
          return;
        }
        void getAgentStatus(taskId)
          .then((statusResponse) => {
            if (statusResponse && isTerminalStatus(statusResponse.status)) {
              onEvent({
                type: "status",
                taskId,
                status: statusResponse.status,
              });
              settle(resolve);
              return;
            }
            settle(resolve);
          })
          .catch(() => settle(resolve));
      },
      (error) => settle(() => reject(new Error(error))),
      { fromSeq: options.fromSeq },
    );
    replaceActiveConnection(taskId, connection);

    if (options.signal) {
      if (options.signal.aborted) {
        connection.close();
        settle(() => reject(createAbortError(taskId)));
        return;
      }

      const onAbort = () => {
        connection.close();
        settle(() => reject(createAbortError(taskId)));
      };
      detachAbortListener = () => {
        options.signal?.removeEventListener("abort", onAbort);
      };
      options.signal.addEventListener("abort", onAbort, { once: true });
    }

    void connection.ready
      .then(() => resolve())
      .catch((error: unknown) => {
        connection.close();
        settle(() =>
          reject(error instanceof Error ? error : new Error(String(error))),
        );
      });
  });
}
