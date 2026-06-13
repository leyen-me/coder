import { inferAutomationRunStatus, trimAutomationRuns } from "./automation-runs";
import { AUTOMATIONS_STORE } from "./constants";
import { getDb } from "./client";
import { normalizeAutomationRecord } from "./normalize-automation";
import { notifyDbChange } from "./subscriptions";
import type {
  AutomationAgentMode,
  AutomationRecord,
  AutomationRunRecord,
  AutomationRunStatus,
} from "./types";

export async function listAutomations(): Promise<AutomationRecord[]> {
  const db = await getDb();
  const items = await db.getAll(AUTOMATIONS_STORE);
  return items
    .map(normalizeAutomationRecord)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listEnabledAutomations(): Promise<AutomationRecord[]> {
  const all = await listAutomations();
  return all.filter((item) => item.enabled);
}

export async function getAutomation(
  id: string
): Promise<AutomationRecord | null> {
  const db = await getDb();
  const record = await db.get(AUTOMATIONS_STORE, id);
  return record ? normalizeAutomationRecord(record) : null;
}

export type CreateAutomationInput = {
  name: string;
  description: string;
  cronExpression: string;
  prompt: string;
  workspaceDir: string | null;
  model: string;
  agentMode: AutomationAgentMode;
  thinkingEnabled: boolean;
  enableEmail: boolean;
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
    workspaceDir: input.workspaceDir?.trim() || null,
    model: input.model.trim(),
    agentMode: input.agentMode,
    thinkingEnabled: input.thinkingEnabled,
    enableEmail: input.enableEmail,
    enabled: true,
    runs: [],
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
    | "name"
    | "description"
    | "cronExpression"
    | "prompt"
    | "workspaceDir"
    | "model"
    | "agentMode"
    | "thinkingEnabled"
    | "enableEmail"
    | "enabled"
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

  const next: AutomationRecord = normalizeAutomationRecord({
    ...existing,
    ...patch,
    name: patch.name?.trim() ?? existing.name,
    description: patch.description?.trim() ?? existing.description,
    cronExpression: patch.cronExpression?.trim() ?? existing.cronExpression,
    workspaceDir:
      patch.workspaceDir !== undefined
        ? patch.workspaceDir?.trim() || null
        : existing.workspaceDir,
    model: patch.model?.trim() ?? existing.model,
    updatedAt: Date.now(),
  });

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

export async function startAutomationRun(
  id: string,
  sessionId: string
): Promise<AutomationRecord | null> {
  const db = await getDb();
  const existing = await db.get(AUTOMATIONS_STORE, id);
  if (!existing) {
    return null;
  }

  const normalized = normalizeAutomationRecord(existing);
  const run: AutomationRunRecord = {
    id: sessionId,
    sessionId,
    startedAt: Date.now(),
    completedAt: null,
    summary: "",
    status: "running",
  };

  const next: AutomationRecord = {
    ...normalized,
    runs: trimAutomationRuns([run, ...normalized.runs]),
    updatedAt: Date.now(),
  };

  await db.put(AUTOMATIONS_STORE, next);
  notifyDbChange();
  return next;
}

export async function finishAutomationRun(
  id: string,
  sessionId: string,
  input: {
    summary: string;
    status: AutomationRunStatus;
  }
): Promise<AutomationRecord | null> {
  const db = await getDb();
  const existing = await db.get(AUTOMATIONS_STORE, id);
  if (!existing) {
    return null;
  }

  const normalized = normalizeAutomationRecord(existing);
  const now = Date.now();
  let found = false;

  const runs = normalized.runs.map((run) => {
    if (run.sessionId !== sessionId) {
      return run;
    }

    found = true;
    return {
      ...run,
      completedAt: now,
      summary: input.summary,
      status: input.status,
    };
  });

  const nextRuns = found
    ? runs
    : trimAutomationRuns([
        {
          id: sessionId,
          sessionId,
          startedAt: now,
          completedAt: now,
          summary: input.summary,
          status: input.status,
        },
        ...normalized.runs,
      ]);

  const next: AutomationRecord = {
    ...normalized,
    runs: nextRuns,
    updatedAt: now,
  };

  await db.put(AUTOMATIONS_STORE, next);
  notifyDbChange();
  return next;
}

/** @deprecated Use startAutomationRun + finishAutomationRun */
export async function markAutomationRun(
  id: string,
  sessionId: string,
  resultSummary: string
): Promise<AutomationRecord | null> {
  return finishAutomationRun(id, sessionId, {
    summary: resultSummary,
    status: inferAutomationRunStatus(resultSummary),
  });
}
