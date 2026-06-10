import { AgentCancellationError, isAgentCancellationError } from "./cancellation";
import type { AgentChatMessage, AgentEvent } from "./types";

export const CHAT_RETRY_MAX_ATTEMPTS = 3;
export const CHAT_RETRY_BASE_DELAY_MS = 1000;

export const STREAM_IDLE_RECOVERY_USER_MESSAGE =
  "（连接超时：模型超过一段时间没有继续输出。请从上次停下的地方接着完成，不要重复已经完成的内容。）";

const RETRIABLE_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export type AgentPartialTurn = {
  content: string;
  reasoningContent: string;
  pendingToolName?: string;
};

export class AgentChatTurnError extends Error {
  readonly hadStreamOutput: boolean;
  readonly partialTurn?: AgentPartialTurn;

  constructor(
    message: string,
    hadStreamOutput: boolean,
    partialTurn?: AgentPartialTurn
  ) {
    super(message);
    this.name = "AgentChatTurnError";
    this.hadStreamOutput = hadStreamOutput;
    this.partialTurn = partialTurn;
  }
}

export function isStreamIdleTimeoutError(message: string): boolean {
  return message.startsWith("Stream read timed out: no data received for");
}

export function buildStreamIdleRecoveryMessages(
  messages: AgentChatMessage[],
  partialTurn?: AgentPartialTurn
): AgentChatMessage[] {
  const next = [...messages];

  if (partialTurn) {
    const content = partialTurn.content.trim();
    const reasoning = partialTurn.reasoningContent.trim();
    if (content || reasoning) {
      const assistant: AgentChatMessage = { role: "assistant" };
      if (content) {
        assistant.content = partialTurn.content;
      }
      if (reasoning) {
        assistant.reasoning_content = partialTurn.reasoningContent;
      }
      next.push(assistant);
    }
  }

  const recoveryMessage = partialTurn?.pendingToolName
    ? `（连接超时：模型在调用 ${partialTurn.pendingToolName} 时停止输出。请从上次停下的地方接着完成该工具调用，不要重复已经完成的内容。）`
    : STREAM_IDLE_RECOVERY_USER_MESSAGE;

  next.push({
    role: "user",
    content: recoveryMessage,
  });

  return next;
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
    message.startsWith("Stream read failed:") ||
    message.startsWith("Stream read timed out:")
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
