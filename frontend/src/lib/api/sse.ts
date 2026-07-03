// SSE client for streaming agent events from Coder HTTP Server.
// Replaces Tauri Channel-based event streaming.

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
 * Backend base URL. In development (Vite dev server), the Vite proxy doesn't
 * support SSE streaming correctly, so connect directly to the backend port.
 * In production (backend serves static files), use the same origin.
 */
function getBackendUrl(): string {
  // Dev: frontend on 1420, backend on 1421
  if (window.location.port === "1420") {
    return "http://localhost:1421";
  }
  return window.location.origin;
}

/**
 * Connect to the SSE endpoint for agent events.
 * Returns a cleanup function to close the connection.
 */
export function connectAgentSse(
  taskId: string,
  onEvent: (event: SseEvent) => void,
  onDone: () => void,
  onError: (error: string) => void,
): () => void {
  const baseUrl = getBackendUrl();
  const eventSource = new EventSource(`${baseUrl}/sse/events/${taskId}`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as SseEvent;
      onEvent(data);

      // Check if this is a terminal event
      if (
        data.type === "agent_event" &&
        "status" in data &&
        typeof data.status === "string"
      ) {
        const terminalStatuses = ["completed", "cancelled", "failed"];
        if (terminalStatuses.includes(data.status)) {
          eventSource.close();
          onDone();
        }
      }
    } catch (e) {
      // Heartbeat or malformed data - ignore
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    onError("SSE connection error");
    onDone();
  };

  return () => {
    eventSource.close();
  };
}

/**
 * Connect to the SSE endpoint for shell output events.
 * Returns a cleanup function.
 */
export function connectShellSse(
  shellId: string,
  onOutput: (stream: string, data: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
): () => void {
  const baseUrl = window.location.origin;
  const eventSource = new EventSource(`${baseUrl}/sse/shell/${shellId}`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as SseEvent;
      if (data.type === "shell_output") {
        onOutput(data.stream, data.data);
      } else if (data.type === "shell_finished") {
        eventSource.close();
        onDone();
      }
    } catch {
      // heartbeat
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    onError("Shell SSE connection error");
    onDone();
  };

  return () => {
    eventSource.close();
  };
}
