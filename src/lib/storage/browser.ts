import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { StoreBackend } from "./types";

// ---------------------------------------------------------------------------
// Schema (mirrors src/lib/db/client.ts)
// ---------------------------------------------------------------------------

interface CoderDbSchema extends DBSchema {
  sessions: {
    key: string;
    value: unknown;
    indexes: { "by-updatedAt": number };
  };
  messages: {
    key: string;
    value: unknown;
    indexes: {
      "by-sessionId": string;
      "by-sessionId-createdAt": [string, number];
    };
  };
  userSkills: {
    key: string;
    value: unknown;
    indexes: { "by-slug": string };
  };
  systemSkillPreferences: {
    key: string;
    value: unknown;
  };
  automations: {
    key: string;
    value: unknown;
    indexes: { "by-updatedAt": number };
  };
  agentTodos: {
    key: string;
    value: unknown;
    indexes: {
      "by-sessionId": string;
      "by-sessionId-order": [string, number];
    };
  };
  remoteTargets: {
    key: string;
    value: unknown;
  };
}

// ---------------------------------------------------------------------------
// Browser backend
// ---------------------------------------------------------------------------

/**
 * IndexedDB-backed store backend.
 *
 * Created lazily via `createBrowserStoreBackend()`.  All calls delegate
 * to the underlying `idb` database.  The `upgrade` callback re-uses the
 * existing migration logic from `src/lib/db/client.ts`.
 */
export class BrowserStoreBackend implements StoreBackend {
  private dbPromise: Promise<IDBPDatabase<CoderDbSchema>> | null = null;
  private dbVersion: number;
  private dbName: string;
  private requiredStores: readonly string[];
  private upgradeHandler: (
    db: IDBPDatabase<CoderDbSchema>,
    oldVersion: number,
    newVersion: number,
  ) => Promise<void>;

  constructor(config: {
    dbName: string;
    dbVersion: number;
    requiredStores: readonly string[];
    upgrade: (
      db: IDBPDatabase<CoderDbSchema>,
      oldVersion: number,
      newVersion: number,
    ) => Promise<void>;
  }) {
    this.dbName = config.dbName;
    this.dbVersion = config.dbVersion;
    this.requiredStores = config.requiredStores;
    this.upgradeHandler = config.upgrade;
  }

  private async getDb(): Promise<IDBPDatabase<CoderDbSchema>> {
    if (!this.dbPromise) {
      this.dbPromise = this.openDb();
    }
    return this.dbPromise;
  }

  private async openDb(): Promise<IDBPDatabase<CoderDbSchema>> {
    const db = await openDB<CoderDbSchema>(this.dbName, this.dbVersion, {
      upgrade: async (database, oldVersion, newVersion, _transaction) => {
        await this.upgradeHandler(database, oldVersion, newVersion ?? this.dbVersion);
      },
    });

    if (!this.requiredStores.every((name) => db.objectStoreNames.contains(name as any))) {
      db.close();
      await deleteDB(this.dbName);
      return this.openDb();
    }

    return db;
  }

  async get<T>(storeName: string, key: string): Promise<T | undefined> {
    const db = await this.getDb();
    return (db as unknown as IDBPDatabase).get(storeName, key) as Promise<T | undefined>;
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    const db = await this.getDb();
    return (db as unknown as IDBPDatabase).getAll(storeName) as Promise<T[]>;
  }

  async put<T>(storeName: string, value: T): Promise<void> {
    const db = await this.getDb();
    await (db as unknown as IDBPDatabase).put(storeName, value);
  }

  async delete(storeName: string, key: string): Promise<void> {
    const db = await this.getDb();
    await (db as unknown as IDBPDatabase).delete(storeName, key);
  }

  async getAllFromIndex<T>(
    storeName: string,
    indexName: string,
    value?: unknown,
  ): Promise<T[]> {
    const db = await this.getDb();
    if (value !== undefined) {
      return (db as unknown as IDBPDatabase).getAllFromIndex(
        storeName,
        indexName,
        value as IDBValidKey | IDBKeyRange,
      ) as Promise<T[]>;
    }
    return (db as unknown as IDBPDatabase).getAllFromIndex(
      storeName,
      indexName,
    ) as Promise<T[]>;
  }

  async count(storeName: string): Promise<number> {
    const db = await this.getDb();
    return (db as unknown as IDBPDatabase).count(storeName);
  }

  async clear(storeName: string): Promise<void> {
    const db = await this.getDb();
    await (db as unknown as IDBPDatabase).clear(storeName);
  }

  /** For test use: drop and re-open the database. */
  async reset(): Promise<void> {
    const db = await this.getDb();
    db.close();
    await deleteDB(this.dbName);
    this.dbPromise = null;
  }
}
