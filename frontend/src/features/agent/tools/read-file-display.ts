import { READ_FILE_TOOL_NAME } from "./definitions";
import type { ReadFileData } from "./types";

export function getReadFileChipLabel(
  toolName: string,
  output: unknown,
): string | null {
  if (toolName !== READ_FILE_TOOL_NAME) {
    return null;
  }

  const data = extractReadFileData(output);
  if (!data) {
    return READ_FILE_TOOL_NAME;
  }

  return `${READ_FILE_TOOL_NAME}: ${data.path}`;
}

export function extractReadFileLinesRead(
  output: unknown,
): { startLine: number; endLine: number } | null {
  const data = extractReadFileData(output);
  if (!data) {
    return null;
  }

  return { startLine: data.startLine, endLine: data.endLine };
}

export function extractReadFileData(
  output: unknown,
): ReadFileData | null {
  const envelope = asRecord(output);
  if (!envelope || envelope.ok !== true) {
    return null;
  }

  const data = envelope.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  if (
    typeof record.path !== "string" ||
    typeof record.totalLines !== "number" ||
    typeof record.startLine !== "number" ||
    typeof record.endLine !== "number"
  ) {
    return null;
  }

  return {
    path: record.path,
    encoding: typeof record.encoding === "string" ? record.encoding : "utf-8",
    mimeType: typeof record.mimeType === "string" ? record.mimeType : "",
    sha256: typeof record.sha256 === "string" ? record.sha256 : "",
    totalLines: record.totalLines,
    startLine: record.startLine,
    endLine: record.endLine,
    truncated: record.truncated === true,
    content: typeof record.content === "string" ? record.content : "",
  };
}

export function formatReadFileOutputForDisplay(output: unknown): {
  path: string;
  totalLines: number;
  startLine: number;
  endLine: number;
  truncated: boolean;
  sha256: string;
  mimeType: string;
  encoding: string;
  content: string;
} | null {
  const data = extractReadFileData(output);
  if (!data) {
    return null;
  }

  return {
    path: data.path,
    totalLines: data.totalLines,
    startLine: data.startLine,
    endLine: data.endLine,
    truncated: data.truncated,
    sha256: data.sha256,
    mimeType: data.mimeType,
    encoding: data.encoding,
    content: data.content,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
