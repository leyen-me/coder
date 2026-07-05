import { getDb } from "./client";
import { SESSIONS_STORE } from "./constants";
import { deleteMessagesBySession } from "./messages";
import { clearAgentTodosBySession } from "./agent-todos";
import { normalizeSessionRecord } from "./normalize-session";
import { notifyDbChange } from "./subscriptions";
import type {
  SessionAutonomyMode,
  SessionKind,
  SessionRecord,
} from "./types";

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

export type CreateSessionInput = {
  id?: string;
  title: string;
  model: string;
  provider: string;
  workspaceDir?: string | null;
  sessionKind?: SessionKind;
  autonomyMode?: SessionAutonomyMode;
  decisionPolicyVersion?: string;
  decisionModel?: string | null;
  parentSessionId?: string | null;
  handoffFromSessionId?: string | null;
  handoffMessageId?: string | null;
  planFileName?: string | null;
  planBuiltAt?: number | null;
  enableEmail?: boolean;
};

export async function createSession(input: CreateSessionInput): Promise<SessionRecord> {
  const now = Date.now();
  const session = normalizeSessionRecord({
    id: input.id ?? createSessionId(),
    title: input.title,
    model: input.model,
    provider: input.provider,
    workspaceDir: input.workspaceDir ?? null,
    sessionKind: input.sessionKind,
    autonomyMode: input.autonomyMode,
    decisionPolicyVersion: input.decisionPolicyVersion,
    decisionModel: input.decisionModel,
    parentSessionId: input.parentSessionId ?? null,
    handoffFromSessionId: input.handoffFromSessionId ?? null,
    handoffMessageId: input.handoffMessageId ?? null,
    planFileName: input.planFileName ?? null,
    planBuiltAt: input.planBuiltAt ?? null,
    enableEmail: input.enableEmail ?? undefined,
    createdAt: now,
    updatedAt: now,
  });

  const db = await getDb();
  await db.put(SESSIONS_STORE, session);
  notifyDbChange();
  return session;
}

export async function getSession(sessionId: string): Promise<SessionRecord | null> {
  const db = await getDb();
  const session = await db.get<SessionRecord>(SESSIONS_STORE, sessionId);
  return session ? normalizeSessionRecord(session) : null;
}

export type SessionPatch = Partial<
  Pick<
    SessionRecord,
    | "title"
    | "model"
    | "provider"
    | "workspaceDir"
    | "sessionKind"
    | "autonomyMode"
    | "decisionPolicyVersion"
    | "decisionModel"
    | "parentSessionId"
    | "handoffFromSessionId"
    | "handoffMessageId"
    | "planFileName"
    | "planBuiltAt"
    | "pinnedAt"
  >
>;

export async function updateSession(
  sessionId: string,
  patch: SessionPatch
): Promise<SessionRecord | null> {
  const db = await getDb();
  const session = await db.get<SessionRecord>(SESSIONS_STORE, sessionId);
  if (!session) {
    return null;
  }

  const next = normalizeSessionRecord({
    ...session,
    ...patch,
    updatedAt: Date.now(),
  });
  await db.put(SESSIONS_STORE, next);
  notifyDbChange();
  return next;
}

export async function updateSessionTitle(
  sessionId: string,
  title: string
): Promise<SessionRecord | null> {
  return updateSession(sessionId, { title });
}

export async function touchSession(sessionId: string): Promise<void> {
  const db = await getDb();
  const session = await db.get<SessionRecord>(SESSIONS_STORE, sessionId);
  if (!session) {
    return;
  }

  await db.put(SESSIONS_STORE, {
    ...normalizeSessionRecord(session),
    updatedAt: Date.now(),
  });
  notifyDbChange();
}

export async function listSessions(limit: number | null = null): Promise<SessionRecord[]> {
  const db = await getDb();
  const sessions = await db.getAllFromIndex<SessionRecord>(SESSIONS_STORE, "by-updatedAt");
  const sorted = sortSessionsPinnedFirst(sessions).map((session) => normalizeSessionRecord(session));
  return limit !== null ? sorted.slice(0, limit) : sorted;
}

/**
 * Sort sessions so pinned items appear first (most recently pinned first),
 * then by updatedAt descending within each group.
 */
function sortSessionsPinnedFirst(sessions: SessionRecord[]): SessionRecord[] {
  return [...sessions].sort((a, b) => {
    const aPinned = a.pinnedAt ?? 0;
    const bPinned = b.pinnedAt ?? 0;
    // Both pinned: most recently pinned first
    if (aPinned && bPinned) return bPinned - aPinned;
    // Only a is pinned
    if (aPinned) return -1;
    // Only b is pinned
    if (bPinned) return 1;
    // Neither pinned: most recently updated first
    return b.updatedAt - a.updatedAt;
  });
}

/** Pin a session so it appears at the top of the chat list. */
export async function pinSession(sessionId: string): Promise<SessionRecord | null> {
  return updateSession(sessionId, { pinnedAt: Date.now() });
}

/** Unpin a session, returning it to natural sort order. */
export async function unpinSession(sessionId: string): Promise<SessionRecord | null> {
  return updateSession(sessionId, { pinnedAt: null });
}

export async function deleteSession(
  sessionId: string
): Promise<void> {
  const db = await getDb();
  await clearAgentTodosBySession(sessionId);
  await db.delete(SESSIONS_STORE, sessionId);
  // Also delete all messages belonging to this session
  await deleteMessagesBySession(sessionId);
  notifyDbChange();
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
