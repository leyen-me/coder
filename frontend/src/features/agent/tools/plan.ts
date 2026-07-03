
import { apiPost } from "@/lib/api/client";
import { emitPlanFileUpdated } from "@/features/plan/plan-events";
import { updateSession } from "@/lib/db/sessions";

import {
  PLAN_CREATE_TOOL_NAME,
  PLAN_DELETE_TOOL_NAME,
  PLAN_EDIT_TOOL_NAME,
  PLAN_LIST_TOOL_NAME,
  PLAN_READ_TOOL_NAME,
  PLAN_UPDATE_TOOL_NAME,
} from "./definitions";
import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";

type PlanNameArgs = {
  name: string;
};

type PlanCreateArgs = {
  name: string;
  content: string;
};

type PlanEditArgs = {
  name: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
};

type PlanFileData = {
  path: string;
  name: string;
  sha256: string;
  bytesWritten: number;
  lines: number;
};

type PlanReadData = {
  path: string;
  name: string;
  content: string;
  sha256: string;
  modifiedAt: number;
};

type PlanListData = {
  plans: Array<{
    name: string;
    path: string;
    modifiedAt: number;
    bytes: number;
  }>;
};

type PlanDeleteData = {
  path: string;
  name: string;
};

type PlanToolErrorPayload = {
  code: string;
  message: string;
};

function requireWorkspace(
  tool: string,
  workspaceDir: string | null | undefined
):
  | { ok: true; workspaceDir: string }
  | { ok: false; result: ReturnType<typeof toolFailure> } {

  if (!workspaceDir?.trim()) {
    return {
      ok: false,
      result: toolFailure(
        tool,
        "workspace_required",
        "Select a workspace directory before managing plans"
      ),
    };
  }

  return { ok: true, workspaceDir: workspaceDir.trim() };
}

function parsePlanNameArgs(
  rawArgs: unknown
): { ok: true; value: PlanNameArgs } | { ok: false; message: string } {
  if (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs)) {
    return { ok: false, message: "Arguments must be a JSON object" };
  }

  const record = rawArgs as Record<string, unknown>;
  const name = record.name;

  if (typeof name !== "string" || !name.trim()) {
    return { ok: false, message: "name is required and must be a non-empty string" };
  }

  return { ok: true, value: { name: name.trim() } };
}

function parsePlanContentArgs(
  rawArgs: unknown
): { ok: true; value: PlanCreateArgs } | { ok: false; message: string } {
  if (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs)) {
    return { ok: false, message: "Arguments must be a JSON object" };
  }

  const record = rawArgs as Record<string, unknown>;
  const name = record.name;
  const content = record.content;

  if (typeof name !== "string" || !name.trim()) {
    return { ok: false, message: "name is required and must be a non-empty string" };
  }

  if (typeof content !== "string") {
    return { ok: false, message: "content is required and must be a string" };
  }

  return {
    ok: true,
    value: {
      name: name.trim(),
      content,
    },
  };
}

function parsePlanEditArgs(
  rawArgs: unknown
): { ok: true; value: PlanEditArgs } | { ok: false; message: string } {
  if (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs)) {
    return { ok: false, message: "Arguments must be a JSON object" };
  }

  const record = rawArgs as Record<string, unknown>;
  const name = record.name;
  const old_string = record.old_string;
  const new_string = record.new_string;
  const replace_all = record.replace_all;

  if (typeof name !== "string" || !name.trim()) {
    return { ok: false, message: "name is required and must be a non-empty string" };
  }

  if (typeof old_string !== "string") {
    return { ok: false, message: "old_string is required and must be a string" };
  }

  if (typeof new_string !== "string") {
    return { ok: false, message: "new_string is required and must be a string" };
  }

  return {
    ok: true,
    value: {
      name: name.trim(),
      old_string,
      new_string,
      replace_all: typeof replace_all === "boolean" ? replace_all : false,
    },
  };
}

function parsePlanToolError(error: unknown): PlanToolErrorPayload | null {
  if (typeof error === "string") {
    return parsePlanToolErrorPayload(error);
  }

  if (error instanceof Error) {
    const fromMessage = parsePlanToolErrorPayload(error.message);
    if (fromMessage) {
      return fromMessage;
    }
  }

  return parsePlanToolErrorPayload(error);
}

function parsePlanToolErrorPayload(raw: unknown): PlanToolErrorPayload | null {
  const parsed =
    typeof raw === "string"
      ? parseJsonPlanToolError(raw)
      : isPlanToolErrorPayload(raw)
        ? raw
        : null;

  return parsed ? { code: parsed.code, message: parsed.message } : null;
}

function parseJsonPlanToolError(raw: string): PlanToolErrorPayload | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isPlanToolErrorPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isPlanToolErrorPayload(value: unknown): value is PlanToolErrorPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.code === "string" && typeof record.message === "string";
}

async function invokePlanTool<TData>(
  tool: string,
  command: string,
  workspaceDir: string,
  args: Record<string, unknown>
): Promise<ReturnType<typeof toolSuccess<TData>> | ReturnType<typeof toolFailure>> {
  try {
    const data = await apiPost<TData>("/api/" + command, {
      workspaceDir,
      ...args,
    });
    return toolSuccess(tool, data);
  } catch (error) {
    const structured = parsePlanToolError(error);
    if (structured) {
      return toolFailure(tool, structured.code, structured.message);
    }

    const message = error instanceof Error ? error.message : String(error);
    return toolFailure(tool, "execution_failed", message);
  }
}

export const planCreateHandler: ToolHandler = async (rawArgs, context) => {
  const workspace = requireWorkspace(PLAN_CREATE_TOOL_NAME, context.workspaceDir);
  if (!workspace.ok) {
    return workspace.result;
  }

  const args = parsePlanContentArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(PLAN_CREATE_TOOL_NAME, "invalid_arguments", args.message);
  }

  const result = await invokePlanTool<PlanFileData>(
    PLAN_CREATE_TOOL_NAME,
    "tool_plan_create",
    workspace.workspaceDir,
    args.value
  );

  if (result.ok) {
    emitPlanFileUpdated({
      path: result.data.path,
      name: result.data.name,
      action: "created",
    });

    // Bind the plan file to the current session
    if (context.sessionId) {
      void updateSession(context.sessionId, { planFileName: result.data.name });
    }
  }

  return result;
};

export const planReadHandler: ToolHandler = async (rawArgs, context) => {
  const workspace = requireWorkspace(PLAN_READ_TOOL_NAME, context.workspaceDir);
  if (!workspace.ok) {
    return workspace.result;
  }

  const args = parsePlanNameArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(PLAN_READ_TOOL_NAME, "invalid_arguments", args.message);
  }

  return invokePlanTool<PlanReadData>(
    PLAN_READ_TOOL_NAME,
    "tool_plan_read",
    workspace.workspaceDir,
    args.value
  );
};

export const planUpdateHandler: ToolHandler = async (rawArgs, context) => {
  const workspace = requireWorkspace(PLAN_UPDATE_TOOL_NAME, context.workspaceDir);
  if (!workspace.ok) {
    return workspace.result;
  }

  const args = parsePlanContentArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(PLAN_UPDATE_TOOL_NAME, "invalid_arguments", args.message);
  }

  const result = await invokePlanTool<PlanFileData>(
    PLAN_UPDATE_TOOL_NAME,
    "tool_plan_update",
    workspace.workspaceDir,
    args.value
  );

  if (result.ok) {
    emitPlanFileUpdated({
      path: result.data.path,
      name: result.data.name,
      action: "updated",
    });

    // Re-bind the plan file to the current session
    if (context.sessionId) {
      void updateSession(context.sessionId, { planFileName: result.data.name });
    }
  }

  return result;
};

export const planEditHandler: ToolHandler = async (rawArgs, context) => {
  const workspace = requireWorkspace(PLAN_EDIT_TOOL_NAME, context.workspaceDir);
  if (!workspace.ok) {
    return workspace.result;
  }

  const args = parsePlanEditArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(PLAN_EDIT_TOOL_NAME, "invalid_arguments", args.message);
  }

  const result = await invokePlanTool<PlanFileData>(
    PLAN_EDIT_TOOL_NAME,
    "tool_plan_edit",
    workspace.workspaceDir,
    {
      name: args.value.name,
      oldString: args.value.old_string,
      newString: args.value.new_string,
      replaceAll: args.value.replace_all,
    }
  );

  if (result.ok) {
    emitPlanFileUpdated({
      path: result.data.path,
      name: result.data.name,
      action: "updated",
    });

    // Re-bind the plan file to the current session
    if (context.sessionId) {
      void updateSession(context.sessionId, { planFileName: result.data.name });
    }
  }

  return result;
};

export const planDeleteHandler: ToolHandler = async (rawArgs, context) => {
  const workspace = requireWorkspace(PLAN_DELETE_TOOL_NAME, context.workspaceDir);
  if (!workspace.ok) {
    return workspace.result;
  }

  const args = parsePlanNameArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(PLAN_DELETE_TOOL_NAME, "invalid_arguments", args.message);
  }

  const result = await invokePlanTool<PlanDeleteData>(
    PLAN_DELETE_TOOL_NAME,
    "tool_plan_delete",
    workspace.workspaceDir,
    args.value
  );

  if (result.ok) {
    emitPlanFileUpdated({
      path: result.data.path,
      name: result.data.name,
      action: "deleted",
    });

    // Clear the plan binding from the current session
    if (context.sessionId) {
      void updateSession(context.sessionId, { planFileName: null });
    }
  }

  return result;
};

export const planListHandler: ToolHandler = async (_rawArgs, context) => {
  const workspace = requireWorkspace(PLAN_LIST_TOOL_NAME, context.workspaceDir);
  if (!workspace.ok) {
    return workspace.result;
  }

  return invokePlanTool<PlanListData>(
    PLAN_LIST_TOOL_NAME,
    "tool_plan_list",
    workspace.workspaceDir,
    {}
  );
};
