import { LIST_DIR_TOOL_NAME } from "./definitions";
import type { ListDirData, ListDirEntry } from "./types";

export function getListDirChipLabel(
  toolName: string,
  input: unknown,
  output: unknown,
): string | null {
  if (toolName !== LIST_DIR_TOOL_NAME) {
    return null;
  }

  const inputRecord = asRecord(input);
  const path =
    typeof inputRecord?.path === "string" ? inputRecord.path.trim() : "";

  const data = extractListDirData(output);
  const entryCount = data?.entries.length ?? 0;

  const pathPreview = path
    ? path.length > 32
      ? `${path.slice(0, 32)}…`
      : path
    : "";

  if (pathPreview) {
    return `list_dir: ${pathPreview} (${entryCount})`;
  }

  return `list_dir (${entryCount} entries)`;
}

export function formatListDirOutputForDisplay(output: unknown): {
  path: string;
  entries: ListDirEntry[];
} | null {
  const data = extractListDirData(output);
  if (!data) {
    return null;
  }

  return {
    path: data.path,
    entries: data.entries,
  };
}

export function extractListDirData(output: unknown): ListDirData | null {
  const envelope = asRecord(output);
  if (!envelope || envelope.ok !== true) {
    return null;
  }

  const data = envelope.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  if (typeof record.path !== "string") {
    return null;
  }

  return {
    path: record.path,
    entries: Array.isArray(record.entries)
      ? (record.entries as ListDirEntry[])
      : [],
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
