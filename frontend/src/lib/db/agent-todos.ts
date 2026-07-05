import { generateId } from "@/lib/generate-id";
import { AGENT_TODOS_STORE } from "./constants";
import { getDb } from "./client";
import { notifyDbChange } from "./subscriptions";
import type { AgentTodoRecord, AgentTodoStatus } from "./types";

const VALID_STATUSES = new Set<AgentTodoStatus>([
  "pending",
  "in_progress",
  "completed",
  "cancelled",
]);

const sessionTodoWriteChains = new Map<string, Promise<unknown>>();

function runSerializedSessionTodoWrite<T>(
  sessionId: string,
  task: () => Promise<T>
): Promise<T> {
  const previous = sessionTodoWriteChains.get(sessionId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => task());
  sessionTodoWriteChains.set(sessionId, next);
  return next.finally(() => {
    if (sessionTodoWriteChains.get(sessionId) === next) {
      sessionTodoWriteChains.delete(sessionId);
    }
  }) as Promise<T>;
}

export type AgentTodoInput = {
  id: string;
  /** Omitted on merge updates keeps the existing content. */
  content?: string;
  status: AgentTodoStatus;
};

export function isValidAgentTodoStatus(
  status: string
): status is AgentTodoStatus {
  return VALID_STATUSES.has(status as AgentTodoStatus);
}

export function normalizeAgentTodoRecord(
  record: AgentTodoRecord
): AgentTodoRecord {
  const status = isValidAgentTodoStatus(record.status)
    ? record.status
    : "pending";

  return {
    id: record.id,
    sessionId: record.sessionId,
    content: record.content.trim(),
    status,
    order: Number.isFinite(record.order) ? record.order : 0,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function getAgentTodosBySession(
  sessionId: string
): Promise<AgentTodoRecord[]> {
  const db = await getDb();
  const items = await db.getAllFromIndex<AgentTodoRecord>(AGENT_TODOS_STORE, "by-sessionId", sessionId);
  return items
    .map(normalizeAgentTodoRecord)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export async function clearAgentTodosBySession(
  sessionId: string
): Promise<void> {
  const db = await getDb();
  const existing = await db.getAllFromIndex<AgentTodoRecord>(
    AGENT_TODOS_STORE,
    "by-sessionId",
    sessionId
  );

  if (existing.length === 0) {
    return;
  }

  await Promise.all(existing.map((item) => db.delete(AGENT_TODOS_STORE, item.id)));
  notifyDbChange();
}

export function applySingleInProgressConstraint(
  todos: AgentTodoRecord[]
): AgentTodoRecord[] {
  return enforceSingleInProgress(todos);
}

export function mergeAgentTodoInputs(
  existing: AgentTodoRecord[],
  incoming: AgentTodoInput[]
): AgentTodoInput[] {
  const incomingById = new Map(
    incoming.map((todo, index) => [todo.id, { ...todo, order: index }])
  );
  const mergedInputs: AgentTodoInput[] = [];

  for (const todo of existing) {
    const next = incomingById.get(todo.id);
    if (next) {
      mergedInputs.push({
        id: next.id,
        content: next.content?.trim() || todo.content,
        status: next.status,
      });
      incomingById.delete(todo.id);
    } else {
      mergedInputs.push({
        id: todo.id,
        content: todo.content,
        status: todo.status,
      });
    }
  }

  for (const next of incomingById.values()) {
    mergedInputs.push({
      id: next.id,
      content: next.content?.trim() ?? "",
      status: next.status,
    });
  }

  return mergedInputs;
}

function enforceSingleInProgress(
  todos: AgentTodoRecord[]
): AgentTodoRecord[] {
  let foundInProgress = false;

  return todos.map((todo) => {
    if (todo.status !== "in_progress") {
      return todo;
    }

    if (foundInProgress) {
      return { ...todo, status: "pending" as const, updatedAt: Date.now() };
    }

    foundInProgress = true;
    return todo;
  });
}

function buildRecordsFromInputs(
  sessionId: string,
  inputs: AgentTodoInput[],
  existingById: Map<string, AgentTodoRecord>
): AgentTodoRecord[] {
  const now = Date.now();

  return inputs.map((input, index) => {
    const existing = existingById.get(input.id);
    const content = input.content?.trim() || existing?.content || "";
    return normalizeAgentTodoRecord({
      id: input.id,
      sessionId,
      content,
      status: input.status,
      order: index,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  });
}

export async function writeAgentTodos(
  sessionId: string,
  input: {
    merge: boolean;
    todos: AgentTodoInput[];
    removeIds?: string[];
  }
): Promise<AgentTodoRecord[]> {
  return runSerializedSessionTodoWrite(sessionId, async () => {
  const db = await getDb();
  const existing = await getAgentTodosBySession(sessionId);
  const existingById = new Map(existing.map((todo) => [todo.id, todo]));
  const removeIds = new Set(input.removeIds ?? []);

  for (const todo of input.todos) {
    if (!existingById.has(todo.id) && !todo.content?.trim()) {
      throw new Error(`New todo "${todo.id}" requires content`);
    }
  }

  let nextRecords: AgentTodoRecord[];

  if (input.merge) {
    const baseExisting = existing.filter((todo) => !removeIds.has(todo.id));
    const mergedInputs = mergeAgentTodoInputs(baseExisting, input.todos);
    const baseExistingById = new Map(
      baseExisting.map((todo) => [todo.id, todo])
    );
    nextRecords = buildRecordsFromInputs(
      sessionId,
      mergedInputs,
      baseExistingById
    );
  } else {
    nextRecords = buildRecordsFromInputs(sessionId, input.todos, existingById);
  }

  nextRecords = enforceSingleInProgress(nextRecords);

  const nextIds = new Set(nextRecords.map((todo) => todo.id));
  const toDelete = existing.filter((todo) => !nextIds.has(todo.id));

  await Promise.all(
    nextRecords.map((todo) => db.put(AGENT_TODOS_STORE, todo)),
  );
  await Promise.all(
    toDelete.map((todo) => db.delete(AGENT_TODOS_STORE, todo.id)),
  );

  notifyDbChange();
  return nextRecords;
  });
}

export async function copyAgentTodosForSession(
  sourceSessionId: string,
  targetSessionId: string
): Promise<void> {
  const sourceTodos = await getAgentTodosBySession(sourceSessionId);
  if (sourceTodos.length === 0) {
    return;
  }

  const db = await getDb();
  const now = Date.now();
  await Promise.all(
    sourceTodos.map((todo) =>
      db.put(AGENT_TODOS_STORE, {
        ...todo,
        id: generateId(),
        sessionId: targetSessionId,
        updatedAt: now,
      })
    )
  );
}
