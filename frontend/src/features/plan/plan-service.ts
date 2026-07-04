import { ApiError, apiPost } from "@/lib/api/client";

import { PLAN_DIRECTORY } from "./constants";

export type PlanListEntry = {
  name: string;
  path: string;
  modifiedAt: number;
  bytes: number;
};

export type PlanReadResult = {
  path: string;
  name: string;
  content: string;
  sha256: string;
  modifiedAt: number;
};

type PlanListResponse = {
  plans: PlanListEntry[];
};

export async function listWorkspacePlans(
  workspaceDir: string
): Promise<PlanListEntry[]> {
  const result = await apiPost<PlanListResponse>("/api/tool_plan_list", {
    workspaceDir,
  });
  return result.plans;
}

export async function readWorkspacePlan(
  workspaceDir: string,
  name: string
): Promise<PlanReadResult> {
  return apiPost<PlanReadResult>("/api/tool_plan_read", {
    workspaceDir,
    name,
  });
}

export async function getLatestWorkspacePlan(
  workspaceDir: string
): Promise<(PlanListEntry & { content?: string }) | null> {
  const plans = await listWorkspacePlans(workspaceDir);
  if (plans.length === 0) {
    return null;
  }

  const latest = [...plans].sort((left, right) => right.modifiedAt - left.modifiedAt)[0];
  if (!latest) {
    return null;
  }

  try {
    const read = await readWorkspacePlan(workspaceDir, latest.name);
    return {
      ...latest,
      content: read.content,
    };
  } catch {
    return latest;
  }
}

export function formatPlanTabLabel(name: string): string {
  return name.endsWith("-plan.md")
    ? name.slice(0, -"-plan.md".length)
    : name;
}

export function isPlanPath(path: string): boolean {
  return path.startsWith(`${PLAN_DIRECTORY}/`) && path.endsWith("-plan.md");
}

type PlanInvokeErrorPayload = {
  code?: string;
  message?: string;
};

export function parsePlanInvokeError(error: unknown): {
  code?: string;
  message: string;
} {
  const structured = parsePlanInvokeErrorPayload(error);
  if (structured?.message) {
    return {
      code: structured.code,
      message: structured.message,
    };
  }

  if (error instanceof Error && error.message.trim()) {
    return { message: error.message };
  }

  if (typeof error === "string" && error.trim()) {
    return { message: error };
  }

  return { message: "Failed to load plan" };
}

export function isPlanNotFoundError(error: unknown): boolean {
  return parsePlanInvokeErrorPayload(error)?.code === "plan_not_found";
}

function parsePlanInvokeErrorPayload(
  error: unknown
): PlanInvokeErrorPayload | null {
  if (error instanceof ApiError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  if (typeof error === "string") {
    return parseJsonPlanInvokeError(error);
  }

  if (error instanceof Error) {
    const fromMessage = parseJsonPlanInvokeError(error.message);
    if (fromMessage) {
      return fromMessage;
    }
  }

  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string") {
      return {
        code: typeof record.code === "string" ? record.code : undefined,
        message: record.message,
      };
    }
  }

  return null;
}

function parseJsonPlanInvokeError(raw: string): PlanInvokeErrorPayload | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    if (typeof record.message !== "string") {
      return null;
    }

    return {
      code: typeof record.code === "string" ? record.code : undefined,
      message: record.message,
    };
  } catch {
    return null;
  }
}
