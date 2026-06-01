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

export async function updateMessage(
  messageId: string,
  patch: Partial<
    Pick<MessageRecord, "content" | "thinking" | "status" | "error" | "taskId">
  >
): Promise<MessageRecord | null> {
  const db = await getDb();
  const existing = await db.get(MESSAGES_STORE, messageId);
  if (!existing) {
    return null;
  }

  const next: MessageRecord = { ...existing, ...patch };
  await db.put(MESSAGES_STORE, next);
  await touchSession(existing.sessionId);
  notifyDbChange();
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
  return updateMessage(messageId, { status, error });
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
