import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";

import { getStoreBackend, setStoreBackend, resetStoreBackend } from "@/lib/storage";
import type { StoreBackend } from "@/lib/storage";
import {
  AGENT_TODOS_STORE,
  AUTOMATIONS_STORE,
  DB_NAME,
  DB_VERSION,
  MESSAGES_STORE,
  REMOTE_TARGETS_STORE,
  SESSIONS_STORE,
  SYSTEM_SKILL_PREFERENCES_STORE,
  USER_SKILLS_STORE,
} from "./constants";
import { normalizeAutomationRecord } from "./normalize-automation";
import { normalizeSessionRecord } from "./normalize-session";
import type {
  AgentTodoRecord,
  AutomationRecord,
  MessageRecord,
  RemoteTargetConfig,
  SessionRecord,
  SystemSkillPreference,
  UserSkillRecord,
} from "./types";

// ---------------------------------------------------------------------------
// IndexedDB schema  (mirror of the idb type, kept local here)
// ---------------------------------------------------------------------------

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
  userSkills: {
    key: string;
    value: UserSkillRecord;
    indexes: { "by-slug": string };
  };
  systemSkillPreferences: {
    key: string;
    value: SystemSkillPreference;
  };
  automations: {
    key: string;
    value: AutomationRecord;
    indexes: { "by-updatedAt": number };
  };
  agentTodos: {
    key: string;
    value: AgentTodoRecord;
    indexes: {
      "by-sessionId": string;
      "by-sessionId-order": [string, number];
    };
  };
  remoteTargets: {
    key: string;
    value: RemoteTargetConfig;
  };
}

const REQUIRED_STORES = [
  SESSIONS_STORE,
  MESSAGES_STORE,
  USER_SKILLS_STORE,
  SYSTEM_SKILL_PREFERENCES_STORE,
  AUTOMATIONS_STORE,
  AGENT_TODOS_STORE,
  REMOTE_TARGETS_STORE,
] as const;

// ---------------------------------------------------------------------------
// Connection management
// ---------------------------------------------------------------------------

let dbPromise: Promise<IDBPDatabase<CoderDbSchema>> | null = null;
let cachedDbVersion: number | null = null;
let backendWrapper: StoreBackend | null = null;

function hasRequiredStores(db: IDBPDatabase<CoderDbSchema>): boolean {
  return REQUIRED_STORES.every((name) => db.objectStoreNames.contains(name));
}

async function openCoderDb(
  repairAttempted = false,
): Promise<IDBPDatabase<CoderDbSchema>> {
  const db = await openDB<CoderDbSchema>(DB_NAME, DB_VERSION, {
    async upgrade(database, oldVersion, _newVersion, transaction) {
      if (!database.objectStoreNames.contains(SESSIONS_STORE)) {
        const store = database.createObjectStore(SESSIONS_STORE, {
          keyPath: "id",
        });
        store.createIndex("by-updatedAt", "updatedAt");
      }

      if (!database.objectStoreNames.contains(MESSAGES_STORE)) {
        const store = database.createObjectStore(MESSAGES_STORE, {
          keyPath: "id",
        });
        store.createIndex("by-sessionId", "sessionId");
        store.createIndex(
          "by-sessionId-createdAt",
          ["sessionId", "createdAt"],
        );
      }

      if (oldVersion > 0 && oldVersion < 2) {
        const store = transaction.objectStore(SESSIONS_STORE);
        const sessions = await store.getAll();
        for (const session of sessions) {
          await store.put(normalizeSessionRecord(session));
        }
      }

      if (!database.objectStoreNames.contains(USER_SKILLS_STORE)) {
        const store = database.createObjectStore(USER_SKILLS_STORE, {
          keyPath: "id",
        });
        store.createIndex("by-slug", "slug", { unique: true });
      }

      if (!database.objectStoreNames.contains(SYSTEM_SKILL_PREFERENCES_STORE)) {
        database.createObjectStore(SYSTEM_SKILL_PREFERENCES_STORE, {
          keyPath: "skillId",
        });
      }

      if (!database.objectStoreNames.contains(AUTOMATIONS_STORE)) {
        const store = database.createObjectStore(AUTOMATIONS_STORE, {
          keyPath: "id",
        });
        store.createIndex("by-updatedAt", "updatedAt");
      }

      if (oldVersion > 0 && oldVersion < 7) {
        const store = transaction.objectStore(AUTOMATIONS_STORE);
        const automations = await store.getAll();
        for (const automation of automations) {
          await store.put({
            ...automation,
            workspaceDir: automation.workspaceDir ?? null,
            model: automation.model?.trim() ?? "",
            agentMode: automation.agentMode === "ask" ? "ask" : "agent",
            thinkingEnabled: automation.thinkingEnabled ?? false,
          });
        }
      }

      if (oldVersion > 0 && oldVersion < 8) {
        const store = transaction.objectStore(AUTOMATIONS_STORE);
        const automations = await store.getAll();
        for (const automation of automations) {
          await store.put(normalizeAutomationRecord(automation));
        }
      }

      if (!database.objectStoreNames.contains(AGENT_TODOS_STORE)) {
        const store = database.createObjectStore(AGENT_TODOS_STORE, {
          keyPath: "id",
        });
        store.createIndex("by-sessionId", "sessionId");
        store.createIndex("by-sessionId-order", ["sessionId", "order"]);
      }

      if (oldVersion > 0 && oldVersion < 10) {
        const store = transaction.objectStore(SESSIONS_STORE);
        const sessions = await store.getAll();
        for (const session of sessions) {
          await store.put(normalizeSessionRecord(session));
        }
      }

      // v11: add provider field to existing sessions and automations
      if (oldVersion > 0 && oldVersion < 11) {
        const sessionStore = transaction.objectStore(SESSIONS_STORE);
        const sessions = await sessionStore.getAll();
        for (const session of sessions) {
          await sessionStore.put(normalizeSessionRecord(session));
        }

        const automationStore = transaction.objectStore(AUTOMATIONS_STORE);
        const automations = await automationStore.getAll();
        for (const automation of automations) {
          await automationStore.put(normalizeAutomationRecord(automation));
        }
      }

      // v12: add remoteTargets store
      if (!database.objectStoreNames.contains(REMOTE_TARGETS_STORE)) {
        database.createObjectStore(REMOTE_TARGETS_STORE, {
          keyPath: "alias",
        });
      }

      // v13-14: no schema changes
      if (oldVersion > 0 && oldVersion < 14) {
        // No migration needed.
      }

      // v15: add pinnedAt field to sessions
      if (oldVersion > 0 && oldVersion < 15) {
        const store = transaction.objectStore(SESSIONS_STORE);
        const sessions = await store.getAll();
        for (const session of sessions) {
          await store.put(normalizeSessionRecord(session));
        }
      }
    },
  });

  if (hasRequiredStores(db)) {
    return db;
  }

  db.close();

  if (repairAttempted) {
    throw new Error("IndexedDB schema is missing required object stores");
  }

  await deleteDB(DB_NAME);
  return openCoderDb(true);
}

// ---------------------------------------------------------------------------
// StoreBackend wrapper
// ---------------------------------------------------------------------------
function wrapDb(db: IDBPDatabase<CoderDbSchema>): StoreBackend {
  return {
    async get<T>(storeName: string, key: string): Promise<T | undefined> {
      return (db as any).get(storeName, key) as Promise<T | undefined>;
    },

    async getAll<T>(storeName: string): Promise<T[]> {
      return (db as any).getAll(storeName) as Promise<T[]>;
    },

    async put<T>(storeName: string, value: T): Promise<void> {
      await (db as any).put(storeName, value);
    },

    async delete(storeName: string, key: string): Promise<void> {
      await (db as any).delete(storeName, key);
    },

    async getAllFromIndex<T>(
      storeName: string,
      indexName: string,
      value?: unknown,
    ): Promise<T[]> {
      if (value !== undefined) {
        return (db as any).getAllFromIndex(
          storeName,
          indexName,
          value,
        ) as Promise<T[]>;
      }
      return (db as any).getAllFromIndex(
        storeName,
        indexName,
      ) as Promise<T[]>;
    },

    async count(storeName: string): Promise<number> {
      return (db as any).count(storeName);
    },

    async clear(storeName: string): Promise<void> {
      await (db as any).clear(storeName);
    },
  };
}
// ---------------------------------------------------------------------------
// Public API  (unchanged consumer interface)
// ---------------------------------------------------------------------------

/**
 * Return the shared `StoreBackend` – a lightweight wrapper around the
 * IndexedDB database.
 *
 * Consumer code in `src/lib/db/` calls the same methods it always has
 * (`get`, `put`, `delete`, `getAll`, `getAllFromIndex`, `count`, `clear`).
 * The return type changes from `IDBPDatabase<CoderDbSchema>` to
 * `StoreBackend`, but the method signatures are identical.
 */
export async function getDb(): Promise<StoreBackend> {
  // Use the HTTP store backend registered by initCoderStorageSync().
  const custom = getStoreBackend();
  if (custom) {
    return custom;
  }

  throw new Error(
    "No store backend configured. Call initCoderStorageSync() before getDb().",
  );
}

/** Re-open after tests that need a fresh IndexedDB schema. */
export function resetDbForTests(): void {
  dbPromise = null;
  cachedDbVersion = null;
  backendWrapper = null;
  resetStoreBackend();
}
