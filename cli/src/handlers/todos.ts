import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler, TodoSnapshotItem } from "./types";
import { getConfigDirPath } from "../config";

// Todos storage — per-session JSON files
function getTodosFilePath(sessionId?: string): string {
  const dir = join(getConfigDirPath(), "todos");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const safeSessionId = (sessionId ?? "default").replace(/[^a-z0-9-]/gi, "");
  return join(dir, `${safeSessionId}.json`);
}

type TodoRecord = {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  order: number;
  createdAt: number;
  updatedAt: number;
};

function readTodos(sessionId?: string): TodoRecord[] {
  const filePath = getTodosFilePath(sessionId);
  if (!existsSync(filePath)) return [];
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return [];
  }
}

function writeTodos(todos: TodoRecord[], sessionId?: string): void {
  writeFileSync(getTodosFilePath(sessionId), JSON.stringify(todos, null, 2), "utf-8");
}

// Handlers
type TodoReadArgs = { session_id?: string };

export const todoReadHandler: ToolHandler = async (rawArgs, context) => {
  const args = rawArgs as TodoReadArgs;
  const sessionId = args.session_id ?? context.sessionId;
  const todos = readTodos(sessionId);

  const snapshot: TodoSnapshotItem[] = todos
    .sort((a, b) => a.order - b.order)
    .map((t) => ({
      id: t.id,
      content: t.content,
      status: t.status,
    }));

  return toolSuccess("todo_read", {
    sessionId: sessionId ?? null,
    todos: snapshot,
    total: snapshot.length,
    active: snapshot.filter((t) => t.status === "pending" || t.status === "in_progress").length,
    completed: snapshot.filter((t) => t.status === "completed").length,
  });
};

type TodoWriteArgs = {
  todos: Array<{
    id: string;
    content: string;
    status: "pending" | "in_progress" | "completed" | "cancelled";
  }>;
  session_id?: string;
};

export const todoWriteHandler: ToolHandler = async (rawArgs, context) => {
  const args = rawArgs as TodoWriteArgs;
  const sessionId = args.session_id ?? context.sessionId;

  if (!args.todos || !Array.isArray(args.todos)) {
    return toolFailure("todo_write", "invalid_arguments", "todos array is required");
  }

  const existing = readTodos(sessionId);
  const existingMap = new Map(existing.map((t) => [t.id, t]));

  // Merge: update existing, add new
  for (let i = 0; i < args.todos.length; i++) {
    const input = args.todos[i];
    const existingRecord = existingMap.get(input.id);
    if (existingRecord) {
      existingRecord.content = input.content;
      existingRecord.status = input.status;
      existingRecord.updatedAt = Date.now();
    } else {
      existing.push({
        id: input.id,
        content: input.content,
        status: input.status,
        order: i,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  writeTodos(existing, sessionId);

  return toolSuccess("todo_write", {
    total: existing.length,
    updated: args.todos.length,
  });
};
