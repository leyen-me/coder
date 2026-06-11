import { AUTOMATIONS_STORE } from "./constants";
import { getDb } from "./client";
import { notifyDbChange } from "./subscriptions";
import type { AutomationRecord } from "./types";

export async function listAutomations(): Promise<AutomationRecord[]> {
  const db = await getDb();
  const items = await db.getAll(AUTOMATIONS_STORE);
  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listEnabledAutomations(): Promise<AutomationRecord[]> {
  const all = await listAutomations();
  return all.filter((item) => item.enabled);
}

export async function getAutomation(
  id: string
): Promise<AutomationRecord | null> {
  const db = await getDb();
  return (await db.get(AUTOMATIONS_STORE, id)) ?? null;
}

export type CreateAutomationInput = {
  name: string;
  description: string;
  cronExpression: string;
  prompt: string;
};

export async function createAutomation(
  input: CreateAutomationInput
): Promise<AutomationRecord> {
  const now = Date.now();
  const record: AutomationRecord = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    description: input.description.trim(),
    cronExpression: input.cronExpression.trim(),
    prompt: input.prompt,
    enabled: true,
    lastRunAt: null,
    lastResultSummary: null,
    lastSessionId: null,
    createdAt: now,
    updatedAt: now,
  };

  const db = await getDb();
  await db.put(AUTOMATIONS_STORE, record);
  notifyDbChange();
  return record;
}

export type UpdateAutomationInput = Partial<
  Pick<
    AutomationRecord,
    "name" | "description" | "cronExpression" | "prompt" | "enabled"
  >
>;

export async function updateAutomation(
  id: string,
  patch: UpdateAutomationInput
): Promise<AutomationRecord | null> {
  const db = await getDb();
  const existing = await db.get(AUTOMATIONS_STORE, id);
  if (!existing) {
    return null;
  }

  const next: AutomationRecord = {
    ...existing,
    ...patch,
    name: patch.name?.trim() ?? existing.name,
    description: patch.description?.trim() ?? existing.description,
    cronExpression: patch.cronExpression?.trim() ?? existing.cronExpression,
    updatedAt: Date.now(),
  };

  await db.put(AUTOMATIONS_STORE, next);
  notifyDbChange();
  return next;
}

export async function deleteAutomation(id: string): Promise<boolean> {
  const db = await getDb();
  const existing = await db.get(AUTOMATIONS_STORE, id);
  if (!existing) {
    return false;
  }

  await db.delete(AUTOMATIONS_STORE, id);
  notifyDbChange();
  return true;
}

export async function markAutomationRun(
  id: string,
  sessionId: string,
  resultSummary: string
): Promise<AutomationRecord | null> {
  const db = await getDb();
  const existing = await db.get(AUTOMATIONS_STORE, id);
  if (!existing) {
    return null;
  }

  const next: AutomationRecord = {
    ...existing,
    lastRunAt: Date.now(),
    lastSessionId: sessionId,
    lastResultSummary: resultSummary,
    updatedAt: Date.now(),
  };

  await db.put(AUTOMATIONS_STORE, next);
  notifyDbChange();
  return next;
}
