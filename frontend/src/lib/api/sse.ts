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

export type SseEvent = AgentEvent | ShellOutputEvent | ShellFinishedEvent;

/**
 * Connect to the SSE endpoint for agent events via fetch + streaming.
 * Returns a cleanup function to abort the connection.
 */
export function connectAgentSse(
  taskId: string,
  onEvent: (event: SseEvent) => void,
  onDone: () => void,
  onError: (error: string) => void,
): () => void {
  const controller = new AbortController();

  void (async () => {
    try {
      const response = await fetch(`/sse/events/${encodeURIComponent(taskId)}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        onError(`SSE error: ${response.status}`);
        onDone();
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onError("SSE: no response body");
        onDone();
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE lines
        while (true) {
          const lineBreak = buffer.indexOf("\n");
          if (lineBreak === -1) break;

          const line = buffer.slice(0, lineBreak).trim();
          buffer = buffer.slice(lineBreak + 1);

          if (!line || line.startsWith(":")) continue; // heartbeat / comment

          if (line.startsWith("data:")) {
            const payload = line.slice(5).trim();
            try {
              const data = JSON.parse(payload) as SseEvent;
              onEvent(data);

              if (
                data.type === "agent_event" &&
                "status" in data &&
                typeof data.status === "string" &&
                ["completed", "cancelled", "failed"].includes(data.status)
              ) {
                controller.abort();
                onDone();
                return;
              }
            } catch {
              // malformed JSON — ignore
            }
          }
        }
      }

      // Stream ended
      onDone();
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      onError(`SSE connection error: ${message}`);
      onDone();
    }
  })();

  return () => {
    controller.abort();
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

        while (true) {
          const lineBreak = buffer.indexOf("\n");
          if (lineBreak === -1) break;

          const line = buffer.slice(0, lineBreak).trim();
          buffer = buffer.slice(lineBreak + 1);

          if (!line || line.startsWith(":")) continue;

          if (line.startsWith("data:")) {
            const payload = line.slice(5).trim();
            try {
              const data = JSON.parse(payload) as SseEvent;
              if (data.type === "shell_output") {
                onOutput(data.stream, data.data);
              } else if (data.type === "shell_finished") {
                controller.abort();
                onDone();
                return;
              }
            } catch {
              // ignore
            }
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
