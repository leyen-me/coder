import { getDb } from "./client";
import { MESSAGES_STORE, SESSIONS_STORE } from "./constants";
import { notifyDbChange } from "./subscriptions";

export type ChatDataStats = {
  sessionCount: number;
  messageCount: number;
};

export async function getChatDataStats(): Promise<ChatDataStats> {
  const db = await getDb();
  const [sessionCount, messageCount] = await Promise.all([
    db.count(SESSIONS_STORE),
    db.count(MESSAGES_STORE),
  ]);
  return { sessionCount, messageCount };
}

export async function clearAllChatData(): Promise<void> {
  const db = await getDb();
  await Promise.all([db.clear(MESSAGES_STORE), db.clear(SESSIONS_STORE)]);
  notifyDbChange();
}
