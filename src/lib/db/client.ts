import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import {
  DB_NAME,
  DB_VERSION,
  MESSAGES_STORE,
  SESSIONS_STORE,
} from "./constants";
import { normalizeSessionRecord } from "./normalize-session";
import type { MessageRecord, SessionRecord } from "./types";

interface CoderDbSchema extends DBSchema {
  sessions: {
    key: string;
    value: SessionRecord;
    indexes: { "by-updatedAt": number };
  };
  messages: {
    key: string;
    value: MessageRecord;
    indexes: {
      "by-sessionId": string;
      "by-sessionId-createdAt": [string, number];
    };
  };
}

let dbPromise: Promise<IDBPDatabase<CoderDbSchema>> | null = null;

export function getDb(): Promise<IDBPDatabase<CoderDbSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<CoderDbSchema>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
          const store = db.createObjectStore(SESSIONS_STORE, { keyPath: "id" });
          store.createIndex("by-updatedAt", "updatedAt");
        }

        if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
          const store = db.createObjectStore(MESSAGES_STORE, { keyPath: "id" });
          store.createIndex("by-sessionId", "sessionId");
          store.createIndex("by-sessionId-createdAt", ["sessionId", "createdAt"]);
        }

        if (oldVersion > 0 && oldVersion < 2) {
          const store = transaction.objectStore(SESSIONS_STORE);
          const sessions = await store.getAll();
          for (const session of sessions) {
            await store.put(normalizeSessionRecord(session));
          }
        }
      },
    });
  }

  return dbPromise;
}

/** Re-open after tests that need a fresh IndexedDB schema. */
export function resetDbForTests(): void {
  dbPromise = null;
}
