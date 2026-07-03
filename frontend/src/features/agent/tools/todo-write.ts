import {
  isValidAgentTodoStatus,
  writeAgentTodos,
  type AgentTodoInput,
} from "@/lib/db/agent-todos";

import { TODO_WRITE_TOOL_NAME } from "./definitions";
import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";

type TodoWriteArgs = {
  merge: boolean;
  todos: AgentTodoInput[];
  removeIds: string[];
};

export const todoWriteHandler: ToolHandler = async (rawArgs, context) => {
  const sessionId = context.sessionId?.trim();
  if (!sessionId) {
    return toolFailure(
      TODO_WRITE_TOOL_NAME,
      "missing_session",
      "Todo updates require an active chat session."
    );
  }

  const args = parseTodoWriteArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(TODO_WRITE_TOOL_NAME, "invalid_arguments", args.message);
  }

  try {
    const records = await writeAgentTodos(sessionId, {
      merge: args.value.merge,
      todos: args.value.todos,
      removeIds: args.value.removeIds,
    });

    return toolSuccess(TODO_WRITE_TOOL_NAME, {
      sessionId,
      merge: args.value.merge,
      removed: args.value.removeIds,
      todos: records.map((todo) => ({
        id: todo.id,
        content: todo.content,
        status: todo.status,
      })),
      total: records.length,
      active: records.filter((todo) => todo.status === "in_progress").length,
      completed: records.filter((todo) => todo.status === "completed").length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolFailure(TODO_WRITE_TOOL_NAME, "execution_failed", message);
  }
};

function parseTodoWriteArgs(
  rawArgs: unknown
): { ok: true; value: TodoWriteArgs } | { ok: false; message: string } {
  if (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs)) {
    return { ok: false, message: "Arguments must be an object" };
  }

  const record = rawArgs as Record<string, unknown>;
  const merge = record.merge;
  const todos = record.todos;
  const removeIds = record.remove_ids;

  if (typeof merge !== "boolean") {
    return { ok: false, message: "merge must be a boolean" };
  }

  if (!Array.isArray(todos)) {
    return { ok: false, message: "todos must be an array" };
  }

  if (removeIds !== undefined && !Array.isArray(removeIds)) {
    return { ok: false, message: "remove_ids must be an array when provided" };
  }

  const parsedRemoveIds = parseRemoveIds(removeIds);
  if (!parsedRemoveIds.ok) {
    return parsedRemoveIds;
  }

  if (merge) {
    if (todos.length === 0 && parsedRemoveIds.value.length === 0) {
      return {
        ok: false,
        message:
          "When merge is true, provide at least one todo update or remove_ids entry",
      };
    }
  } else if (todos.length === 0) {
    return {
      ok: true,
      value: {
        merge,
        todos: [],
        removeIds: [],
      },
    };
  }

  const parsedTodos: AgentTodoInput[] = [];

  for (const [index, item] of todos.entries()) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return { ok: false, message: `todos[${index}] must be an object` };
    }

    const todo = item as Record<string, unknown>;
    const id = todo.id;
    const content = todo.content;
    const status = todo.status;

    if (typeof id !== "string" || !id.trim()) {
      return { ok: false, message: `todos[${index}].id is required` };
    }

    if (content !== undefined && typeof content !== "string") {
      return { ok: false, message: `todos[${index}].content must be a string` };
    }

    if (!merge && (typeof content !== "string" || !content.trim())) {
      return { ok: false, message: `todos[${index}].content is required` };
    }

    if (typeof status !== "string" || !isValidAgentTodoStatus(status)) {
      return {
        ok: false,
        message: `todos[${index}].status must be pending, in_progress, completed, or cancelled`,
      };
    }

    parsedTodos.push({
      id: id.trim(),
      content: typeof content === "string" ? content.trim() : undefined,
      status,
    });
  }

  const ids = new Set<string>();
  for (const todo of parsedTodos) {
    if (ids.has(todo.id)) {
      return { ok: false, message: `Duplicate todo id: ${todo.id}` };
    }
    ids.add(todo.id);
  }

  const inProgressCount = parsedTodos.filter(
    (todo) => todo.status === "in_progress"
  ).length;
  if (inProgressCount > 1) {
    return {
      ok: false,
      message: "Only one todo can be in_progress at a time",
    };
  }

  if (!merge && parsedRemoveIds.value.length > 0) {
    return {
      ok: false,
      message: "remove_ids is only supported when merge is true",
    };
  }

  return {
    ok: true,
    value: {
      merge,
      todos: parsedTodos,
      removeIds: parsedRemoveIds.value,
    },
  };
}

function parseRemoveIds(
  removeIds: unknown
):
  | { ok: true; value: string[] }
  | { ok: false; message: string } {
  if (removeIds === undefined) {
    return { ok: true, value: [] };
  }

  if (!Array.isArray(removeIds)) {
    return { ok: false, message: "remove_ids must be an array when provided" };
  }

  const parsed: string[] = [];
  const seen = new Set<string>();

  for (const [index, item] of removeIds.entries()) {
    if (typeof item !== "string" || !item.trim()) {
      return { ok: false, message: `remove_ids[${index}] must be a non-empty string` };
    }

    const id = item.trim();
    if (seen.has(id)) {
      return { ok: false, message: `Duplicate remove_ids entry: ${id}` };
    }

    seen.add(id);
    parsed.push(id);
  }

  return { ok: true, value: parsed };
}
