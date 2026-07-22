import {
  TODO_READ_TOOL_NAME,
  TODO_WRITE_TOOL_NAME,
} from "./definitions";
import type { TodoSnapshotItem } from "./types";
import { sortTodosByOrder } from "@/lib/db/agent-todos";

export function getTodoChipLabel(
  toolName: string,
  output: unknown,
): string | null {
  if (toolName !== TODO_READ_TOOL_NAME && toolName !== TODO_WRITE_TOOL_NAME) {
    return null;
  }

  const data = extractTodoData(output);
  if (!data) {
    return toolName;
  }

  if (data.total === 0) {
    return `${toolName}: 0 todos`;
  }

  const parts: string[] = [];
  if (data.active > 0) {
    parts.push(`${data.active} active`);
  }
  if (data.completed > 0) {
    parts.push(`${data.completed} done`);
  }
  const summary = parts.length > 0 ? ` (${parts.join(", ")})` : "";

  return `${toolName}: ${data.total} todo${data.total !== 1 ? "s" : ""}${summary}`;
}

export function formatTodoOutputForDisplay(output: unknown): {
  sessionId: string;
  merge?: boolean;
  removed?: string[];
  todos: TodoSnapshotItem[];
  total: number;
  active: number;
  completed: number;
} | null {
  const data = extractTodoData(output);
  if (!data) {
    return null;
  }

  return data;
}

function extractTodoData(
  output: unknown,
): {
  sessionId: string;
  merge?: boolean;
  removed?: string[];
  todos: TodoSnapshotItem[];
  total: number;
  active: number;
  completed: number;
} | null {
  const envelope = asRecord(output);
  if (!envelope || envelope.ok !== true) {
    return null;
  }

  const data = envelope.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  if (typeof record.sessionId !== "string") {
    return null;
  }

  return {
    sessionId: record.sessionId,
    merge:
      typeof record.merge === "boolean" ? record.merge : undefined,
    removed: Array.isArray(record.removed)
      ? (record.removed as string[])
      : undefined,
    todos: Array.isArray(record.todos)
      ? sortTodosByOrder(record.todos as TodoSnapshotItem[])
      : [],
    total: typeof record.total === "number" ? record.total : 0,
    active: typeof record.active === "number" ? record.active : 0,
    completed: typeof record.completed === "number" ? record.completed : 0,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
