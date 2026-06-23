import { getDb } from "./client";
import { MESSAGES_STORE } from "./constants";
import { notifyDbChange } from "./subscriptions";
import { touchSession } from "./sessions";
import type { MessageRecord, MessageStatus } from "./types";

export function createMessageId(): string {
  return crypto.randomUUID();
}

export function createTaskId(): string {
  return crypto.randomUUID();
}

export async function createMessage(
  input: Omit<MessageRecord, "createdAt"> & { createdAt?: number }
): Promise<MessageRecord> {
  const message: MessageRecord = {
    ...input,
    createdAt: input.createdAt ?? Date.now(),
  };

  const db = await getDb();
  await db.put(MESSAGES_STORE, message);
  await touchSession(message.sessionId);
  notifyDbChange();
  return message;
}

export async function getMessagesBySession(
  sessionId: string
): Promise<MessageRecord[]> {
  const db = await getDb();
  const messages = await db.getAllFromIndex(
    MESSAGES_STORE,
    "by-sessionId",
    sessionId
  );
  return messages.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getMessage(messageId: string): Promise<MessageRecord | null> {
  const db = await getDb();
  return (await db.get(MESSAGES_STORE, messageId)) ?? null;
}

/**
 * Controls the side effects of a message write.
 *
 * High-frequency streaming flushes persist to IndexedDB purely as a crash/reload
 * backup while the in-memory streaming overlay drives the visible UI. Such writes
 * should set `silent: true` (skip the global UI re-fetch) and `touch: false`
 * (skip re-ordering the session list on every token) to avoid a re-fetch storm.
 */
export type UpdateMessageOptions = {
  /** When true, do not broadcast a DB change (no UI re-fetch is triggered). */
  silent?: boolean;
  /** When true (default), bump the owning session's `updatedAt` ordering. */
  touch?: boolean;
};

export async function updateMessage(
  messageId: string,
  patch: Partial<
    Pick<
      MessageRecord,
      | "content"
      | "thinking"
      | "processSteps"
      | "status"
      | "error"
      | "taskId"
      | "toolInvocations"
      | "images"
      | "referencedSkills"
      | "messageKind"
      | "durationMs"
      | "usage"
    >
  >,
  options: UpdateMessageOptions = {}
): Promise<MessageRecord | null> {
  const { silent = false, touch = true } = options;
  const db = await getDb();
  const existing = await db.get(MESSAGES_STORE, messageId);
  if (!existing) {
    return null;
  }

  const next: MessageRecord = { ...existing, ...patch };
  if ("images" in patch && patch.images === undefined) {
    delete next.images;
  }
  if ("referencedSkills" in patch && patch.referencedSkills === undefined) {
    delete next.referencedSkills;
  }
  if ("messageKind" in patch && patch.messageKind === undefined) {
    delete next.messageKind;
  }
  await db.put(MESSAGES_STORE, next);
  if (touch) {
    await touchSession(existing.sessionId);
  }
  if (!silent) {
    notifyDbChange();
  }
  return next;
}

export async function appendMessageDelta(
  messageId: string,
  field: "content" | "thinking",
  delta: string
): Promise<MessageRecord | null> {
  const existing = await getMessage(messageId);
  if (!existing) {
    return null;
  }

  return updateMessage(messageId, {
    [field]: existing[field] + delta,
  });
}

export async function setMessageStatus(
  messageId: string,
  status: MessageStatus,
  error: string | null = null
): Promise<MessageRecord | null> {
  const patch: Partial<MessageRecord> = { status, error };

  // Persist process duration when the message completes, so historical
  // sessions show how long the agent took.
  if (status === "completed") {
    const existing = await getMessage(messageId);
    if (existing && existing.durationMs === undefined) {
      patch.durationMs = Date.now() - existing.createdAt;
    }
  }

  return updateMessage(messageId, patch);
}

export async function deleteMessagesBySession(
  sessionId: string
): Promise<void> {
  const db = await getDb();
  const messages = await db.getAllFromIndex(
    MESSAGES_STORE,
    "by-sessionId",
    sessionId
  );
  await Promise.all(
    messages.map((message) => db.delete(MESSAGES_STORE, message.id))
  );
}

export async function deleteMessagesAfter(
  sessionId: string,
  messageId: string
): Promise<string[]> {
  const messages = await getMessagesBySession(sessionId);
  const cutoffIndex = messages.findIndex((message) => message.id === messageId);
  if (cutoffIndex === -1) {
    throw new Error(`Message not found: ${messageId}`);
  }

  const toDelete = messages.slice(cutoffIndex + 1);
  if (toDelete.length === 0) {
    return [];
  }

  const db = await getDb();
  await Promise.all(
    toDelete.map((message) => db.delete(MESSAGES_STORE, message.id))
  );
  await touchSession(sessionId);
  notifyDbChange();
  return toDelete.map((message) => message.id);
}

export async function searchMessages(
  query: string,
  limit = 20
): Promise<MessageRecord[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const db = await getDb();
  const messages = await db.getAll(MESSAGES_STORE);
  return messages
    .filter(
      (message) =>
        message.content.toLowerCase().includes(normalized) ||
        message.thinking.toLowerCase().includes(normalized)
    )
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}
