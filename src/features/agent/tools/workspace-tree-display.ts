import { GET_WORKSPACE_TREE_TOOL_NAME } from "./definitions";
import type { WorkspaceTreeData } from "./types";

export function getWorkspaceTreeChipLabel(
  toolName: string,
  output: unknown,
): string | null {
  if (toolName !== GET_WORKSPACE_TREE_TOOL_NAME) {
    return null;
  }

  const data = extractWorkspaceTreeData(output);
  if (!data) {
    return GET_WORKSPACE_TREE_TOOL_NAME;
  }

  return `${GET_WORKSPACE_TREE_TOOL_NAME}: L${data.startLine}-${data.endLine}`;
}

export function extractWorkspaceTreeData(
  output: unknown,
): WorkspaceTreeData | null {
  const envelope = asRecord(output);
  if (!envelope || envelope.ok !== true) {
    return null;
  }

  const data = envelope.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  if (typeof record.treeText !== "string") {
    return null;
  }

  return {
    treeText: record.treeText,
    totalLines: typeof record.totalLines === "number" ? record.totalLines : 0,
    startLine: typeof record.startLine === "number" ? record.startLine : 1,
    endLine: typeof record.endLine === "number" ? record.endLine : 0,
    truncated: record.truncated === true,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
