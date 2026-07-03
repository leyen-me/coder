import {
  PLAN_CREATE_TOOL_NAME,
  PLAN_DELETE_TOOL_NAME,
  PLAN_EDIT_TOOL_NAME,
  PLAN_LIST_TOOL_NAME,
  PLAN_READ_TOOL_NAME,
  PLAN_UPDATE_TOOL_NAME,
} from "./definitions";

export type PlanFileResult = {
  path: string;
  name: string;
  sha256: string;
  bytesWritten: number;
  lines: number;
};

export type PlanReadResult = {
  path: string;
  name: string;
  content: string;
  sha256: string;
  modifiedAt: number;
};

export type PlanListResult = {
  plans: Array<{
    name: string;
    path: string;
    modifiedAt: number;
    bytes: number;
  }>;
};

export type PlanDeleteResult = {
  path: string;
  name: string;
};

const PLAN_TOOLS = new Set([
  PLAN_CREATE_TOOL_NAME,
  PLAN_READ_TOOL_NAME,
  PLAN_UPDATE_TOOL_NAME,
  PLAN_EDIT_TOOL_NAME,
  PLAN_DELETE_TOOL_NAME,
  PLAN_LIST_TOOL_NAME,
]);

export function getPlanChipLabel(
  toolName: string,
  input: unknown,
  output: unknown,
): string | null {
  if (!PLAN_TOOLS.has(toolName)) {
    return null;
  }

  const inputRecord = asRecord(input);
  const name =
    typeof inputRecord?.name === "string" ? inputRecord.name.trim() : "";

  switch (toolName) {
    case PLAN_LIST_TOOL_NAME: {
      const data = extractPlanListData(output);
      if (data) {
        return `${toolName}: ${data.plans.length} plan${data.plans.length !== 1 ? "s" : ""}`;
      }
      return toolName;
    }

    case PLAN_CREATE_TOOL_NAME: {
      const data = extractPlanFileData(output);
      if (data) {
        return `${toolName}: ${data.name} (${data.lines} lines)`;
      }
      return name ? `${toolName}: ${name}` : toolName;
    }

    case PLAN_READ_TOOL_NAME: {
      const data = extractPlanReadData(output);
      if (data) {
        return `${toolName}: ${data.name} (${data.content.length} chars)`;
      }
      return name ? `${toolName}: ${name}` : toolName;
    }

    case PLAN_UPDATE_TOOL_NAME:
    case PLAN_EDIT_TOOL_NAME: {
      const data = extractPlanFileData(output);
      if (data) {
        return `${toolName}: ${data.name}`;
      }
      return name ? `${toolName}: ${name}` : toolName;
    }

    case PLAN_DELETE_TOOL_NAME: {
      return `${toolName}: ${name || "plan"}`;
    }

    default:
      return name ? `${toolName}: ${name}` : toolName;
  }
}

/**
 * Extract PlanFileResult from a tool result envelope.
 * Discriminated by `lines` (number) — unique to create/update/edit results.
 */
export function extractPlanFileData(output: unknown): PlanFileResult | null {
  const data = unwrapData(output);
  if (!data || typeof data.lines !== "number") {
    return null;
  }

  return {
    path: String(data.path ?? ""),
    name: typeof data.name === "string" ? data.name : String(data.path ?? "").split("/").pop() ?? String(data.path ?? ""),
    sha256: typeof data.sha256 === "string" ? data.sha256 : "",
    bytesWritten: typeof data.bytesWritten === "number" ? data.bytesWritten : 0,
    lines: data.lines,
  };
}

/**
 * Extract PlanReadResult from a tool result envelope.
 * Discriminated by `content` (string) — unique to plan_read results.
 */
export function extractPlanReadData(output: unknown): PlanReadResult | null {
  const data = unwrapData(output);
  if (!data || typeof data.content !== "string") {
    return null;
  }

  return {
    path: String(data.path ?? ""),
    name: typeof data.name === "string" ? data.name : String(data.path ?? "").split("/").pop() ?? String(data.path ?? ""),
    content: data.content,
    sha256: typeof data.sha256 === "string" ? data.sha256 : "",
    modifiedAt: typeof data.modifiedAt === "number" ? data.modifiedAt : 0,
  };
}

/**
 * Extract PlanListResult from a tool result envelope.
 * Discriminated by `plans` (array) — unique to plan_list results.
 */
export function extractPlanListData(output: unknown): PlanListResult | null {
  const data = unwrapData(output);
  if (!data || !Array.isArray(data.plans)) {
    return null;
  }

  return {
    plans: data.plans as PlanListResult["plans"],
  };
}

/**
 * Extract PlanDeleteResult from a tool result envelope.
 * Only matches when `path` exists but none of the type-discriminating
 * fields (lines, content, plans) are present.
 */
export function extractPlanDeleteData(output: unknown): PlanDeleteResult | null {
  const data = unwrapData(output);
  if (!data || typeof data.path !== "string") {
    return null;
  }

  // Must NOT have fields from the other result types.
  if (typeof data.lines === "number") return null;
  if (typeof data.content === "string") return null;
  if (Array.isArray(data.plans)) return null;

  return {
    path: data.path,
    name: typeof data.name === "string" ? data.name : data.path.split("/").pop() ?? data.path,
  };
}

/** Unwrap the top-level result envelope to get the data payload. */
function unwrapData(output: unknown): Record<string, unknown> | null {
  const envelope = asRecord(output);
  if (!envelope || envelope.ok !== true) {
    return null;
  }

  const data = envelope.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  return data as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
