import {
  SESSIONS_STORE,
  getAgentTodosBySession,
  getDb,
  getMessagesBySession,
  getSession,
  normalizeSessionRecord,
} from "@/lib/db";
import type {
  AgentTodoRecord,
  MessageRecord,
  SessionRecord,
} from "@/lib/db";

/** Identifier for the top-level export envelope. */
export const SESSION_EXPORT_FORMAT = "coder-session-export";
/** Bump when the payload shape changes in a breaking way. */
export const SESSION_EXPORT_VERSION = 1;

/**
 * A session and everything attached to it: the raw session record, all raw
 * message records (including tool inputs/outputs, thinking, process steps,
 * errors, usage, images…), agent todos, and — recursively — any sub-agent
 * sessions (which are hidden from the sidebar but part of the conversation).
 */
export type SessionExportEntry = {
  session: SessionRecord;
  messages: MessageRecord[];
  todos: AgentTodoRecord[];
  /** Child (sub-agent) sessions, recursively exported in chronological order. */
  subSessions: SessionExportEntry[];
};

export type SessionExportFile = SessionExportEntry & {
  format: typeof SESSION_EXPORT_FORMAT;
  version: typeof SESSION_EXPORT_VERSION;
  /** Export time (ms since epoch), not the session's own timestamps. */
  exportedAt: number;
};

/** Strip characters that are invalid or undesirable in filenames. */
export function sanitizeFilename(name: string): string {
  return name
    .replaceAll(/[/\\:*?"<>|…]/g, "") // remove OS-invalid filename chars & ellipsis
    .replaceAll(/\s+/g, " ") // collapse whitespace
    .trim();
}

/**
 * Sub-agent sessions are stored as ordinary session rows pointing at their
 * parent via `parentSessionId`, with no dedicated index. Query all rows and
 * filter (export is an infrequent, non-hot-path operation).
 */
async function loadChildSessions(
  parentSessionId: string
): Promise<SessionRecord[]> {
  const db = await getDb();
  const sessions = await db.getAll<SessionRecord>(SESSIONS_STORE);
  return sessions
    .filter((session) => session.parentSessionId === parentSessionId)
    .map(normalizeSessionRecord)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Recursively collect a session and everything attached to it: messages,
 * agent todos, and all sub-agent sessions. Returns `null` when the session
 * does not exist. The `seen` set guards against reference cycles in the
 * session graph.
 */
export async function buildSessionExport(
  sessionId: string,
  seen: ReadonlySet<string> = new Set()
): Promise<SessionExportEntry | null> {
  if (seen.has(sessionId)) {
    return null;
  }
  const nextSeen = new Set(seen).add(sessionId);

  const session = await getSession(sessionId);
  if (!session) {
    return null;
  }

  const [messages, todos, children] = await Promise.all([
    getMessagesBySession(sessionId),
    getAgentTodosBySession(sessionId),
    loadChildSessions(sessionId),
  ]);

  const subSessions: SessionExportEntry[] = [];
  for (const child of children) {
    const entry = await buildSessionExport(child.id, nextSeen);
    if (entry) {
      subSessions.push(entry);
    }
  }

  return { session, messages, todos, subSessions };
}

function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export a session as a single uncompressed, pretty-printed JSON file with
 * full raw fidelity (no summarization, no field dropping, no compression).
 * Returns `false` when the session does not exist.
 */
export async function exportSessionAsJson(sessionId: string): Promise<boolean> {
  const entry = await buildSessionExport(sessionId);
  if (!entry) {
    return false;
  }

  const payload: SessionExportFile = {
    format: SESSION_EXPORT_FORMAT,
    version: SESSION_EXPORT_VERSION,
    exportedAt: Date.now(),
    ...entry,
  };

  const json = JSON.stringify(payload, null, 2);
  const cleanTitle = sanitizeFilename(entry.session.title || "");
  const filename = cleanTitle ? `${cleanTitle}.json` : `${sessionId}.json`;
  downloadTextFile(filename, json, "application/json;charset=utf-8");
  return true;
}
