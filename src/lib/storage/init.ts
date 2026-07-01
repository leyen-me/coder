import {
  setStoreBackend,
  resetStoreBackend,
  setKVStore,
  getTauriFsKvStore,
  TauriSqliteBackend,
} from "@/lib/storage";
import type { StoreBackend } from "@/lib/storage";
import type {
  AutomationRecord,
  MessageRecord,
  SessionRecord,
  UserSkillRecord,
  SystemSkillPreference,
  AgentTodoRecord,
  RemoteTargetConfig,
} from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

let migrationDone = false;

/**
 * Initialize the `~/.coder/` storage backends and migrate data from
 * IndexedDB if this is the first run with the new backend.
 *
 * Call this **once** at app startup, before any database access.
 */
export async function initCoderStorage(): Promise<void> {
  if (migrationDone) return;
  migrationDone = true;

  // 1. Switch KV store to file-system backed settings.json
  setKVStore(getTauriFsKvStore());

  // 2. Create and register the SQLite backend
  const sqlite = new TauriSqliteBackend();
  setStoreBackend(sqlite);

  // 3. Warm up both backends so ~/.coder/ directory and files
  //    are created immediately, not lazily on first access.
  await sqlite.warmup();

  // 4. Check whether migration from IndexedDB is needed.
  //    If `entities` table is empty and IndexedDB has data, migrate.
  await maybeMigrateFromIdb(sqlite);
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

async function maybeMigrateFromIdb(sqlite: StoreBackend): Promise<void> {
  // Check if we already have data in SQLite
  const sessionCount = await sqlite.count("sessions");
  const messageCount = await sqlite.count("messages");

  // If SQLite already has data, skip migration
  if (sessionCount > 0 || messageCount > 0) {
    return;
  }

  // Try reading from IndexedDB.  If it fails (no IndexedDB available,
  // or no data), silently skip migration.
  let idbSessions: SessionRecord[];
  try {
    const { listSessions } = await import("@/lib/db/sessions");
    idbSessions = await listSessions(9999);
  } catch {
    return; // IndexedDB not available or no data
  }

  if (idbSessions.length === 0) {
    return; // No data to migrate
  }

  console.log(
    `[storage-init] Migrating ${idbSessions.length} sessions from IndexedDB to SQLite…`,
  );

  // Temporarily set the store backend back to IndexedDB to read data
  resetStoreBackend();
  const idb = await import("@/lib/db/client").then((m) => m.getDb());

  try {
    // Migrate sessions
    const sessions = await idb.getAll<SessionRecord>("sessions");
    for (const session of sessions) {
      await sqlite.put("sessions", session);
    }

    // Migrate messages
    const messages = await idb.getAll<MessageRecord>("messages");
    for (const message of messages) {
      await sqlite.put("messages", message);
    }

    // Migrate user skills
    const skills = await idb.getAll<UserSkillRecord>("userSkills");
    for (const skill of skills) {
      await sqlite.put("userSkills", skill);
    }

    // Migrate system skill preferences
    const prefs = await idb.getAll<SystemSkillPreference>(
      "systemSkillPreferences",
    );
    for (const pref of prefs) {
      await sqlite.put("systemSkillPreferences", pref);
    }

    // Migrate automations
    const automations = await idb.getAll<AutomationRecord>("automations");
    for (const automation of automations) {
      await sqlite.put("automations", automation);
    }

    // Migrate agent todos
    const todos = await idb.getAll<AgentTodoRecord>("agentTodos");
    for (const todo of todos) {
      await sqlite.put("agentTodos", todo);
    }

    // Migrate remote targets
    const targets = await idb.getAll<RemoteTargetConfig>("remoteTargets");
    for (const target of targets) {
      await sqlite.put("remoteTargets", target);
    }

    console.log("[storage-init] Migration complete.");
  } finally {
    // Re-register the SQLite backend
    setStoreBackend(sqlite);
  }
}
