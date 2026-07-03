import { getDb } from "./client";
import { MESSAGES_STORE, SESSIONS_STORE } from "./constants";
import { listSessions } from "./sessions";
import { normalizeSessionRecord } from "./normalize-session";
import type { MessageRecord, SessionRecord } from "./types";

export type ChatSearchResultKind = "session" | "message";

export type ChatSearchResult = {
  kind: ChatSearchResultKind;
  sessionId: string;
  title: string;
  snippet?: string;
  messageId?: string;
  updatedAt: number;
};

const SNIPPET_RADIUS = 32;
const MAX_SNIPPET_LENGTH = 96;

function buildSnippet(text: string, query: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }

  const lowerText = normalized.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex === -1) {
    return normalized.length <= MAX_SNIPPET_LENGTH
      ? normalized
      : `${normalized.slice(0, MAX_SNIPPET_LENGTH - 1)}…`;
  }

  const start = Math.max(0, matchIndex - SNIPPET_RADIUS);
  const end = Math.min(
    normalized.length,
    matchIndex + lowerQuery.length + SNIPPET_RADIUS
  );

  let snippet = normalized.slice(start, end);
  if (start > 0) {
    snippet = `…${snippet}`;
  }
  if (end < normalized.length) {
    snippet = `${snippet}…`;
  }

  return snippet;
}

function messageSearchText(message: MessageRecord): string {
  return [message.content, message.thinking]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");
}

function sessionResult(session: SessionRecord): ChatSearchResult {
  return {
    kind: "session",
    sessionId: session.id,
    title: session.title,
    updatedAt: session.updatedAt,
  };
}

function messageResult(
  message: MessageRecord,
  session: SessionRecord,
  query: string
): ChatSearchResult {
  return {
    kind: "message",
    sessionId: session.id,
    title: session.title,
    messageId: message.id,
    snippet: buildSnippet(messageSearchText(message), query),
    updatedAt: message.createdAt,
  };
}

export async function searchChats(
  query: string,
  limit = 20
): Promise<ChatSearchResult[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    const sessions = await listSessions(limit);
    return sessions.map(sessionResult);
  }

  const db = await getDb();
  const [sessions, messages] = await Promise.all([
    db.getAll<SessionRecord>(SESSIONS_STORE),
    db.getAll<MessageRecord>(MESSAGES_STORE),
  ]);

  const sessionById = new Map(
    sessions
      .map((session) => normalizeSessionRecord(session))
      .map((session) => [session.id, session] as const)
  );

  const results: ChatSearchResult[] = [];
  const seenMessageIds = new Set<string>();

  for (const rawSession of sessions) {
    const session = normalizeSessionRecord(rawSession);
    if (!session.title.toLowerCase().includes(normalized)) {
      continue;
    }

    results.push(sessionResult(session));
  }

  for (const message of messages) {
    if (seenMessageIds.has(message.id)) {
      continue;
    }

    const searchable = messageSearchText(message).toLowerCase();
    if (!searchable.includes(normalized)) {
      continue;
    }

    const session = sessionById.get(message.sessionId);
    if (!session) {
      continue;
    }

    seenMessageIds.add(message.id);
    results.push(messageResult(message, session, normalized));
  }

  return results
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, limit);
}
