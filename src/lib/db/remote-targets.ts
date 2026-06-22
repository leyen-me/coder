import { REMOTE_TARGETS_STORE } from "./constants";
import { getDb } from "./client";
import { notifyDbChange } from "./subscriptions";
import type { RemoteTargetConfig } from "./types";

export async function listRemoteTargets(): Promise<RemoteTargetConfig[]> {
  const db = await getDb();
  const targets = await db.getAll(REMOTE_TARGETS_STORE);
  return targets.sort((a, b) => a.alias.localeCompare(b.alias));
}

export async function getRemoteTarget(
  alias: string
): Promise<RemoteTargetConfig | null> {
  const db = await getDb();
  return (await db.get(REMOTE_TARGETS_STORE, alias)) ?? null;
}

export async function saveRemoteTarget(
  config: RemoteTargetConfig
): Promise<void> {
  const db = await getDb();
  await db.put(REMOTE_TARGETS_STORE, config);
  notifyDbChange();
}

export async function deleteRemoteTarget(alias: string): Promise<boolean> {
  const db = await getDb();
  const existing = await db.get(REMOTE_TARGETS_STORE, alias);
  if (!existing) {
    return false;
  }

  await db.delete(REMOTE_TARGETS_STORE, alias);
  notifyDbChange();
  return true;
}
