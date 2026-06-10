import { AgentCancellationError, isAgentCancellationError } from "./cancellation";
import type { AgentEvent } from "./types";

export const CHAT_RETRY_MAX_ATTEMPTS = 3;
export const CHAT_RETRY_BASE_DELAY_MS = 1000;

const RETRIABLE_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export class AgentChatTurnError extends Error {
  readonly hadStreamOutput: boolean;

  constructor(message: string, hadStreamOutput: boolean) {
    super(message);
    this.name = "AgentChatTurnError";
    this.hadStreamOutput = hadStreamOutput;
  }
}

/** Stream events that commit partial assistant output and prevent safe retry. */
export function isCommittedStreamOutputEvent(event: AgentEvent): boolean {
  return (
    event.type === "thinking_delta" ||
    event.type === "content_delta" ||
    event.type === "tool_call_pending" ||
    event.type === "turn_complete"
  );
}

export function isRetriableChatError(error: unknown): boolean {
  if (isAgentCancellationError(error)) {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);

  if (message.startsWith("Agent turn ended with status: cancelled")) {
    return false;
  }

  const apiMatch = message.match(/^API error \((\d+)\):/);
  if (apiMatch) {
    const status = Number(apiMatch[1]);
    return RETRIABLE_HTTP_STATUSES.has(status);
  }

  if (
    message.startsWith("Request failed:") ||
    message.startsWith("Stream read failed:")
  ) {
    return true;
  }

  if (message === "Failed to fetch" || message.includes("NetworkError")) {
    return true;
  }

  if (message.startsWith("Response body is empty")) {
    return true;
  }

  return false;
}

export function chatRetryDelayMs(attempt: number): number {
  return CHAT_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AgentCancellationError());
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new AgentCancellationError());
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
