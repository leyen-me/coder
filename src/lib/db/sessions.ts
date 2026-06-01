import { getDb } from "./client";
import { SESSIONS_STORE } from "./constants";
import { notifyDbChange } from "./subscriptions";
import type { SessionRecord } from "./types";

export function createSessionId(): string {
  return crypto.randomUUID();
}

export function deriveSessionTitle(text: string, maxLength = 48): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

export async function createSession(input: {
  id?: string;
  title: string;
  model: string;
}): Promise<SessionRecord> {
  const now = Date.now();
  const session: SessionRecord = {
    id: input.id ?? createSessionId(),
    title: input.title,
    model: input.model,
    createdAt: now,
    updatedAt: now,
  };

  const db = await getDb();
  await db.put(SESSIONS_STORE, session);
  notifyDbChange();
  return session;
}

export async function getSession(sessionId: string): Promise<SessionRecord | null> {
  const db = await getDb();
  return (await db.get(SESSIONS_STORE, sessionId)) ?? null;
}

export async function updateSessionTitle(
  sessionId: string,
  title: string
): Promise<SessionRecord | null> {
  const db = await getDb();
  const session = await db.get(SESSIONS_STORE, sessionId);
  if (!session) {
    return null;
  }

  const next: SessionRecord = {
    ...session,
    title,
    updatedAt: Date.now(),
  };
  await db.put(SESSIONS_STORE, next);
  notifyDbChange();
  return next;
}

export async function touchSession(sessionId: string): Promise<void> {
  const db = await getDb();
  const session = await db.get(SESSIONS_STORE, sessionId);
  if (!session) {
    return;
  }

  await db.put(SESSIONS_STORE, {
    ...session,
    updatedAt: Date.now(),
  });
  notifyDbChange();
}

export async function listSessions(limit = 50): Promise<SessionRecord[]> {
  const db = await getDb();
  const sessions = await db.getAllFromIndex(SESSIONS_STORE, "by-updatedAt");
  return sessions.reverse().slice(0, limit);
}

export async function searchSessions(query: string, limit = 20): Promise<SessionRecord[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return listSessions(limit);
  }

  const sessions = await listSessions(200);
  return sessions
    .filter((session) => session.title.toLowerCase().includes(normalized))
    .slice(0, limit);
}
