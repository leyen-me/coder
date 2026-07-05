// HTTP-based store backend for Coder Server mode.

import { apiPost } from "@/lib/api/client";

export interface IndexEntry {
  name: string;
  value: string;
}

export interface StoreBackend {
  get<T>(storeName: string, key: string): Promise<T | undefined>;
  getAll<T>(storeName: string): Promise<T[]>;
  put<T>(storeName: string, value: T & { id: string }): Promise<void>;
  delete(storeName: string, key: string): Promise<void>;
  getAllFromIndex<T>(
    storeName: string,
    indexName: string,
    value?: unknown,
  ): Promise<T[]>;
  count(storeName: string): Promise<number>;
  clear(storeName: string): Promise<void>;
}

// Index definitions matching the Rust side
const INDEX_DEFS: Record<string, Record<string, string>> = {
  sessions: { "by-updatedAt": "updatedAt" },
  messages: { "by-sessionId": "sessionId", "by-sessionId-createdAt": "sessionId" },
  userSkills: { "by-slug": "slug" },
  automations: { "by-updatedAt": "updatedAt" },
  agentTodos: { "by-sessionId": "sessionId", "by-sessionId-order": "sessionId" },
};

function buildIndexes(
  store: string,
  value: Record<string, unknown>,
): IndexEntry[] {
  const defs = INDEX_DEFS[store];
  if (!defs) return [];
  return Object.entries(defs).map(([name, key]) => ({
    name,
    value: String(value[key] ?? ""),
  }));
}

export class HttpStoreBackend implements StoreBackend {
  async get<T>(storeName: string, key: string): Promise<T | undefined> {
    const result = await apiPost<T | null>("/db/get", {
      store: storeName,
      id: key,
    });
    return result ?? undefined;
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    const result = await apiPost<unknown[]>("/db/get_all", {
      store: storeName,
    });
    return (result ?? []) as T[];
  }

  async put<T>(storeName: string, value: T & { id?: string }): Promise<void> {
    const indexes = buildIndexes(storeName, value as unknown as Record<string, unknown>);
    // Different stores use different key fields; resolve the id accordingly.
    const KEY_FIELDS: Record<string, string> = {
      remoteTargets: "alias",
      systemSkillPreferences: "skillId",
    };
    const keyField = KEY_FIELDS[storeName] ?? "id";
    const id = String((value as Record<string, unknown>)[keyField] ?? value.id ?? "");
    await apiPost("/db/put", {
      store: storeName,
      id,
      value,
      indexes,
    });
  }

  async delete(storeName: string, key: string): Promise<void> {
    await apiPost("/db/delete", { store: storeName, id: key });
  }

  async getAllFromIndex<T>(
    storeName: string,
    indexName: string,
    value?: unknown,
  ): Promise<T[]> {
    const result = await apiPost<T[]>("/db/get_all_from_index", {
      store: storeName,
      index_name: indexName,
      index_value: value ?? null,
    });
    return result ?? [];
  }

  async count(storeName: string): Promise<number> {
    const result = await apiPost<{ count: number }>("/db/count", {
      store: storeName,
    });
    return result.count;
  }

  async clear(storeName: string): Promise<void> {
    await apiPost("/db/clear", { store: storeName });
  }
}
