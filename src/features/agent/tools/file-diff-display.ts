import {
  EDIT_FILE_TOOL_NAME,
  REPLACE_FILE_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
} from "./definitions";

type FileDiffData = {
  path: string;
  action: string;
  oldContent?: string;
  /** The actual content written to disk (after line-ending normalization). */
  newContent?: string;
  linesAdded: number;
  linesRemoved: number;
  warning?: string;
};

export function getFileDiffChipLabel(
  toolName: string,
  input: unknown,
  output: unknown
): string | null {
  if (
    toolName !== WRITE_FILE_TOOL_NAME &&
    toolName !== REPLACE_FILE_TOOL_NAME &&
    toolName !== EDIT_FILE_TOOL_NAME
  ) {
    return null;
  }

  // Try extracting path from the result data first (more reliable).
  const data = extractFileDiffData(output);
  if (data?.path) {
    return `${toolName}: ${data.path}`;
  }

  // Fall back to extracting path from input arguments.
  const inputRecord = asRecord(input);
  const inputPath =
    typeof inputRecord?.path === "string" ? inputRecord.path.trim() : "";
  if (inputPath) {
    return `${toolName}: ${inputPath}`;
  }

  return toolName;
}

export function extractFileDiffData(output: unknown): FileDiffData | null {
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
    action: typeof record.action === "string" ? record.action : "unknown",
    oldContent:
      typeof record.oldContent === "string" ? record.oldContent : undefined,
    newContent:
      typeof record.newContent === "string" ? record.newContent : undefined,
    linesAdded:
      typeof record.linesAdded === "number" ? record.linesAdded : 0,
    linesRemoved:
      typeof record.linesRemoved === "number" ? record.linesRemoved : 0,
    warning:
      typeof record.warning === "string" ? record.warning : undefined,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
