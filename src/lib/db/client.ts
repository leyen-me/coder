import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import {
  DB_NAME,
  DB_VERSION,
  MESSAGES_STORE,
  SESSIONS_STORE,
} from "./constants";
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
      upgrade(db) {
        if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
          const store = db.createObjectStore(SESSIONS_STORE, { keyPath: "id" });
          store.createIndex("by-updatedAt", "updatedAt");
        }

        if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
          const store = db.createObjectStore(MESSAGES_STORE, { keyPath: "id" });
          store.createIndex("by-sessionId", "sessionId");
          store.createIndex("by-sessionId-createdAt", ["sessionId", "createdAt"]);
        }
      },
    });
  }

  return dbPromise;
}
