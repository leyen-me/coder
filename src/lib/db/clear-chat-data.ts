import { getDb } from "./client";
import { MESSAGES_STORE, SESSIONS_STORE } from "./constants";
import { notifyDbChange } from "./subscriptions";

export type ChatDataStats = {
  sessionCount: number;
  messageCount: number;
  storageSize: number;
};

export async function getChatDataStats(): Promise<ChatDataStats> {
  const db = await getDb();
  const [sessionCount, messageCount] = await Promise.all([
    db.count(SESSIONS_STORE),
    db.count(MESSAGES_STORE),
  ]);

  // Estimate storage used by sessions + messages based on JSON value length.
  // Not exact (ignores SQLite page/index overhead) but proportional to actual
  // data volume and reflects how much space clearing would reclaim.
  let storageSize = 0;
  try {
    const [sessions, messages] = await Promise.all([
      db.getAll<Record<string, unknown>>(SESSIONS_STORE),
      db.getAll<Record<string, unknown>>(MESSAGES_STORE),
    ]);
    storageSize = new Blob([
      ...sessions.map((s) => JSON.stringify(s)),
      ...messages.map((m) => JSON.stringify(m)),
    ]).size;
  } catch {
    // estimate not available
  }

  return { sessionCount, messageCount, storageSize };
}

export async function clearAllChatData(): Promise<void> {
  const db = await getDb();
  await Promise.all([db.clear(MESSAGES_STORE), db.clear(SESSIONS_STORE)]);
  notifyDbChange();
}
