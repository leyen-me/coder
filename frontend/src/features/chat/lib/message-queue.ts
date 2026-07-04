import type { FileUIPart } from "ai";

export type QueuedMessagePayload = {
  text: string;
  files: FileUIPart[];
  skillSlugs?: string[];
};

export type QueuedMessage = QueuedMessagePayload & {
  id: string;
};

export function updateQueuedMessage(
  queue: readonly QueuedMessage[],
  messageId: string,
  payload: QueuedMessagePayload
): QueuedMessage[] {
  return queue.map((message) =>
    message.id === messageId ? { ...message, ...payload } : message
  );
}

export function removeQueuedMessage(
  queue: readonly QueuedMessage[],
  messageId: string
): QueuedMessage[] {
  return queue.filter((message) => message.id !== messageId);
}

export function takeNextQueuedMessage(queue: readonly QueuedMessage[]): {
  message: QueuedMessage | null;
  remaining: QueuedMessage[];
} {
  const [message, ...remaining] = queue;

  return {
    message: message ?? null,
    remaining,
  };
}
