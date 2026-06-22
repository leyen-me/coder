import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";

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

let dbPromise: Promise<IDBPDatabase<CoderDbSchema>> | null = null;
let cachedDbVersion: number | null = null;

function hasRequiredStores(db: IDBPDatabase<CoderDbSchema>): boolean {
  return REQUIRED_STORES.every((name) => db.objectStoreNames.contains(name));
}

async function openCoderDb(repairAttempted = false): Promise<IDBPDatabase<CoderDbSchema>> {
  const db = await openDB<CoderDbSchema>(DB_NAME, DB_VERSION, {
    async upgrade(database, oldVersion, _newVersion, transaction) {
      if (!database.objectStoreNames.contains(SESSIONS_STORE)) {
        const store = database.createObjectStore(SESSIONS_STORE, { keyPath: "id" });
        store.createIndex("by-updatedAt", "updatedAt");
      }

      if (!database.objectStoreNames.contains(MESSAGES_STORE)) {
        const store = database.createObjectStore(MESSAGES_STORE, { keyPath: "id" });
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

export function getDb(): Promise<IDBPDatabase<CoderDbSchema>> {
  if (dbPromise && cachedDbVersion === DB_VERSION) {
    return dbPromise;
  }

  dbPromise = openCoderDb().then((db) => {
    cachedDbVersion = DB_VERSION;
    return db;
  });

  return dbPromise;
}

/** Re-open after tests that need a fresh IndexedDB schema. */
export function resetDbForTests(): void {
  dbPromise = null;
  cachedDbVersion = null;
}
