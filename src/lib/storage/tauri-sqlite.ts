import { homeDir, join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";

import type { StoreBackend } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * SQLite-backed implementation of `StoreBackend`.
 *
 * Schema:
 * ```
 * ~/.coder/coder.db
 * ├── entities(store, id, value)    — all records as JSON
 * └── idx(store, index_name, index_value, id)  — index entries
 * ```
 *
 * Every `put` writes the full JSON value into `entities` and, for known
 * indexes, upserts the corresponding `idx` row(s).  Every index query
 * joins against `idx` and returns the JSON value.
 *
 * Migration (schema versioning) is handled via a `_meta` table and
 * `PRAGMA user_version`.
 */
export class TauriSqliteBackend implements StoreBackend {
  private db: Database | null = null;
  private dbPath: string | null = null;
  private initPromise: Promise<void> | null = null;

  // Map of store names to their primary key field (keyPath in IndexedDB terms).
  // Not every store uses "id" – remoteTargets uses "alias",
  // systemSkillPreferences uses "skillId".
  private static readonly KEY_FIELD: Record<string, string> = {
    sessions: "id",
    messages: "id",
    userSkills: "id",
    systemSkillPreferences: "skillId",
    automations: "id",
    agentTodos: "id",
    remoteTargets: "alias",
  };

  // Map of (store, indexName) → JSON path expression used to extract
  private static readonly INDEX_DEFS: Record<
    string,
    Record<string, string>
  > = {
    sessions: { "by-updatedAt": "$.updatedAt" },
    messages: {
      "by-sessionId": "$.sessionId",
      "by-sessionId-createdAt": "$.sessionId", // composite handled via order
    },
    userSkills: { "by-slug": "$.slug" },
    automations: { "by-updatedAt": "$.updatedAt" },
    agentTodos: {
      "by-sessionId": "$.sessionId",
      "by-sessionId-order": "$.sessionId",
    },
  };

  // -----------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------

  private async ensureInit(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }
    this.initPromise = this.init();
    await this.initPromise;
  }

  private async init(): Promise<void> {
    const home = await homeDir();

    const dirPath = await join(home, ".coder");
    const filePath = await join(home, ".coder", "coder.db");

    // Ensure ~/.coder/ directory exists
    try {
      await invoke("ensure_dir", { targetPath: dirPath });
    } catch (err) {
      console.error("[tauri-sqlite] ensure_dir failed:", err);
      throw err;
    }

    this.dbPath = filePath;
    this.db = await Database.load(`sqlite:${this.dbPath}`);

    await this.migrate();
  }

  /** Force initialization (open database, create tables).  Idempotent. */
  async warmup(): Promise<void> {
    await this.ensureInit();
  }

  private async migrate(): Promise<void> {
    if (!this.db) return;

    // Get current schema version
    const rows = await this.db.select<{ version: number }[]>(
      "PRAGMA user_version",
    );
    let version = rows[0]?.version ?? 0;

    if (version < 1) {
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS entities (
          store TEXT NOT NULL,
          id TEXT NOT NULL,
          value TEXT NOT NULL,
          PRIMARY KEY (store, id)
        )
      `);
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS idx (
          store TEXT NOT NULL,
          index_name TEXT NOT NULL,
          index_value TEXT NOT NULL,
          id TEXT NOT NULL,
          PRIMARY KEY (store, index_name, index_value, id)
        )
      `);
      version = 1;
      await this.db.execute("PRAGMA user_version = 1");
    }
  }

  // -----------------------------------------------------------------------
  // StoreBackend interface
  // -----------------------------------------------------------------------

  async get<T>(storeName: string, key: string): Promise<T | undefined> {
    await this.ensureInit();
    if (!this.db) return undefined;

    const rows = await this.db.select<{ value: string }[]>(
      "SELECT value FROM entities WHERE store = $1 AND id = $2",
      [storeName, key],
    );
    return rows.length > 0 ? (JSON.parse(rows[0].value) as T) : undefined;
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    await this.ensureInit();
    if (!this.db) return [];

    const rows = await this.db.select<{ value: string }[]>(
      "SELECT value FROM entities WHERE store = $1 ORDER BY id",
      [storeName],
    );
    return rows.map((r) => JSON.parse(r.value) as T);
  }

  async put<T>(storeName: string, value: T): Promise<void> {
    await this.ensureInit();
    if (!this.db) return;

    const keyField = TauriSqliteBackend.KEY_FIELD[storeName] ?? "id";
    const id = String((value as Record<string, unknown>)[keyField] ?? "");
    if (!id) {
      throw new Error(
        `put: record missing key field "${keyField}" for store "${storeName}"`,
      );
    }

    const json = JSON.stringify(value);

    // Upsert the entity
    await this.db.execute(
      "INSERT OR REPLACE INTO entities (store, id, value) VALUES ($1, $2, $3)",
      [storeName, id, json],
    );

    // Maintain index entries for this store
    const indexDefs = TauriSqliteBackend.INDEX_DEFS[storeName];
    if (indexDefs) {
      // Remove old index entries for this (store, id)
      await this.db.execute(
        "DELETE FROM idx WHERE store = $1 AND id = $2",
        [storeName, id],
      );

      const parsed = value as Record<string, unknown>;
      for (const [indexName, jsonPath] of Object.entries(indexDefs)) {
        // Simple JSON path extraction: "$.field" → parsed[field]
        const fieldName = jsonPath.replace("$.", "");
        const fieldValue = parsed[fieldName];
        if (fieldValue !== undefined && fieldValue !== null) {
          await this.db.execute(
            "INSERT INTO idx (store, index_name, index_value, id) VALUES ($1, $2, $3, $4)",
            [storeName, indexName, String(fieldValue), id],
          );
        }
      }
    }
  }

  async delete(storeName: string, key: string): Promise<void> {
    await this.ensureInit();
    if (!this.db) return;

    await this.db.execute(
      "DELETE FROM entities WHERE store = $1 AND id = $2",
      [storeName, key],
    );
    await this.db.execute(
      "DELETE FROM idx WHERE store = $1 AND id = $2",
      [storeName, key],
    );
  }

  async getAllFromIndex<T>(
    storeName: string,
    indexName: string,
    value?: unknown,
  ): Promise<T[]> {
    await this.ensureInit();
    if (!this.db) return [];

    if (value !== undefined) {
      // Filtered by index value
      const rows = await this.db.select<{ value: string }[]>(
        `SELECT e.value
         FROM entities e
         INNER JOIN idx i ON i.store = e.store AND i.id = e.id
         WHERE e.store = $1 AND i.index_name = $2 AND i.index_value = $3
         ORDER BY i.index_value`,
        [storeName, indexName, String(value)],
      );
      return rows.map((r) => JSON.parse(r.value) as T);
    }

    // Unfiltered – return all entities ordered by the index value.
    // If no index definition exists, fall back to unordered.
    const indexDefs = TauriSqliteBackend.INDEX_DEFS[storeName];
    const jsonPath = indexDefs?.[indexName];
    if (!jsonPath) {
      const rows = await this.db.select<{ value: string }[]>(
        "SELECT value FROM entities WHERE store = $1",
        [storeName],
      );
      return rows.map((r) => JSON.parse(r.value) as T);
    }

    const rows = await this.db.select<{ value: string }[]>(
      `SELECT e.value
       FROM entities e
       LEFT JOIN idx i ON i.store = e.store AND i.id = e.id AND i.index_name = $2
       WHERE e.store = $1
       ORDER BY i.index_value`,
      [storeName, indexName],
    );
    return rows.map((r) => JSON.parse(r.value) as T);
  }

  async count(storeName: string): Promise<number> {
    await this.ensureInit();
    if (!this.db) return 0;

    const rows = await this.db.select<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM entities WHERE store = $1",
      [storeName],
    );
    return rows[0]?.count ?? 0;
  }

  async clear(storeName: string): Promise<void> {
    await this.ensureInit();
    if (!this.db) return;

    await this.db.execute("DELETE FROM entities WHERE store = $1", [
      storeName,
    ]);
    await this.db.execute("DELETE FROM idx WHERE store = $1", [storeName]);
  }

  /** Close the database connection. */
  async close(): Promise<void> {
    // @tauri-apps/plugin-sql currently does not expose a close() method
    // on the public API.  The connection will be closed when the app
    // terminates or the JS object is garbage-collected.
    this.db = null;
    this.initPromise = null;
  }
}
