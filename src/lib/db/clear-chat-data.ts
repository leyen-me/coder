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
  const [sessionCount, messageCount, estimate] = await Promise.all([
    db.count(SESSIONS_STORE),
    db.count(MESSAGES_STORE),
    navigator.storage?.estimate?.(),
  ]);
  const storageSize =
    estimate?.usage != null ? estimate.usage : 0;
  return { sessionCount, messageCount, storageSize };
}

export async function clearAllChatData(): Promise<void> {
  const db = await getDb();
  await Promise.all([db.clear(MESSAGES_STORE), db.clear(SESSIONS_STORE)]);
  notifyDbChange();
}
