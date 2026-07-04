// SSE client for streaming agent events from Coder HTTP Server.
// Uses fetch + ReadableStream to avoid EventSource CORS issues.

export interface AgentEvent {
  type: string;
  taskId?: string;
  status?: string;
  delta?: string;
  content?: string;
  toolCallId?: string;
  name?: string;
  message?: string;
  [key: string]: unknown;
}

export interface ShellOutputEvent {
  type: "shell_output";
  shellId: string;
  stream: string;
  data: string;
}

export interface ShellFinishedEvent {
  type: "shell_finished";
  shellId: string;
  output: unknown;
}

export interface SseCloseEvent {
  type: "close";
  reason?: string;
  message?: string;
  skipped?: number;
}

export type SseEvent =
  | AgentEvent
  | ShellOutputEvent
  | ShellFinishedEvent
  | SseCloseEvent;
export type AgentSseConnection = {
  close: () => void;
  ready: Promise<void>;
};
export type AgentSseCompletion = {
  reason: "terminal_status" | "stream_end" | "server_close";
  closeEvent?: SseCloseEvent;
};

function drainSseEventBlocks(buffer: string): {
  events: string[];
  rest: string;
} {
  const events: string[] = [];
  let rest = buffer.replace(/\r\n/g, "\n");

  while (true) {
    const separatorIndex = rest.indexOf("\n\n");
    if (separatorIndex === -1) {
      break;
    }

    events.push(rest.slice(0, separatorIndex));
    rest = rest.slice(separatorIndex + 2);
  }

  return { events, rest };
}

function readSsePayload(block: string): string | null {
  const dataLines: string[] = [];

  for (const rawLine of block.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(":")) {
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return dataLines.join("\n");
}

function isTerminalAgentStatus(
  event: SseEvent
): event is AgentEvent & { type: "status"; status: "completed" | "cancelled" | "failed" } {
  return (
    event.type === "status" &&
    typeof event.status === "string" &&
    ["completed", "cancelled", "failed"].includes(event.status)
  );
}

function logMalformedSsePayload(scope: "agent" | "shell", payload: string, error: unknown) {
  console.warn(`[${scope} SSE] Failed to parse payload`, {
    error,
    payload,
  });
}

/**
 * Connect to the SSE endpoint for agent events via fetch + streaming.
 * The returned `ready` promise resolves once the HTTP stream is established and
 * subscribed on the server, which lets callers avoid missing the first events.
 */
export function connectAgentSse(
  taskId: string,
  onEvent: (event: SseEvent) => void,
  onDone: (completion: AgentSseCompletion) => void,
  onError: (error: string) => void,
): AgentSseConnection {
  const controller = new AbortController();
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  let readySettled = false;
  let doneSignaled = false;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = () => {
      if (readySettled) {
        return;
      }
      readySettled = true;
      resolve();
    };
    rejectReady = (error: Error) => {
      if (readySettled) {
        return;
      }
      readySettled = true;
      reject(error);
    };
  });
  const signalDone = (completion: AgentSseCompletion) => {
    if (doneSignaled) {
      return;
    }
    doneSignaled = true;
    onDone(completion);
  };

  void (async () => {
    try {
      const response = await fetch(`/sse/events/${encodeURIComponent(taskId)}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = new Error(`SSE error: ${response.status}`);
        rejectReady(error);
        onError(error.message);
        signalDone({ reason: "stream_end" });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        const error = new Error("SSE: no response body");
        rejectReady(error);
        onError(error.message);
        signalDone({ reason: "stream_end" });
        return;
      }

      resolveReady();

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const drained = drainSseEventBlocks(buffer);
        buffer = drained.rest;

        for (const block of drained.events) {
          const payload = readSsePayload(block);
          if (!payload) {
            continue;
          }

          try {
            const data = JSON.parse(payload) as SseEvent;
            if (data.type === "close") {
              controller.abort();
              signalDone({ reason: "server_close", closeEvent: data as SseCloseEvent });
              return;
            }

            onEvent(data);

            if (isTerminalAgentStatus(data)) {
              controller.abort();
              signalDone({ reason: "terminal_status" });
              return;
            }
          } catch (error) {
            logMalformedSsePayload("agent", payload, error);
          }
        }
      }

      signalDone({ reason: "stream_end" });
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      rejectReady(new Error(message));
      onError(`SSE connection error: ${message}`);
    }
  })();

  return {
    ready,
    close: () => {
      controller.abort();
    },
  };
}

/**
 * Connect to the SSE endpoint for shell output events.
 */
export function connectShellSse(
  shellId: string,
  onOutput: (stream: string, data: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
): () => void {
  const controller = new AbortController();

  void (async () => {
    try {
      const response = await fetch(`/sse/shell/${shellId}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        onError(`Shell SSE error: ${response.status}`);
        onDone();
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onError("Shell SSE: no response body");
        onDone();
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const drained = drainSseEventBlocks(buffer);
        buffer = drained.rest;

        for (const block of drained.events) {
          const payload = readSsePayload(block);
          if (!payload) {
            continue;
          }

          try {
            const data = JSON.parse(payload) as SseEvent;
            if (data.type === "shell_output") {
              const output = data as ShellOutputEvent;
              onOutput(output.stream, output.data);
            } else if (data.type === "shell_finished" || data.type === "close") {
              controller.abort();
              onDone();
              return;
            }
          } catch (error) {
            logMalformedSsePayload("shell", payload, error);
          }
        }
      }

      onDone();
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      onError(`Shell SSE error: ${message}`);
      onDone();
    }
  })();

  return () => {
    controller.abort();
  };
}
