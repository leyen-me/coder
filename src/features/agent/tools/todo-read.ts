import { getAgentTodosBySession } from "@/lib/db/agent-todos";

import { TODO_READ_TOOL_NAME } from "./definitions";
import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";

export const todoReadHandler: ToolHandler = async (rawArgs, context) => {
  const sessionId = context.sessionId?.trim();
  if (!sessionId) {
    return toolFailure(
      TODO_READ_TOOL_NAME,
      "missing_session",
      "Todo reads require an active chat session."
    );
  }

  const args = parseTodoReadArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(TODO_READ_TOOL_NAME, "invalid_arguments", args.message);
  }

  try {
    const records = await getAgentTodosBySession(sessionId);
    return toolSuccess(TODO_READ_TOOL_NAME, {
      sessionId,
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
    return toolFailure(TODO_READ_TOOL_NAME, "execution_failed", message);
  }
};

function parseTodoReadArgs(
  rawArgs: unknown
): { ok: true } | { ok: false; message: string } {
  if (rawArgs === undefined) {
    return { ok: true };
  }

  if (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs)) {
    return { ok: false, message: "Arguments must be an object" };
  }

  if (Object.keys(rawArgs).length > 0) {
    return { ok: false, message: "todo_read does not accept any arguments" };
  }

  return { ok: true };
}
