import { GREP_TOOL_NAME } from "./definitions";
import type { GrepContentMatch, GrepCountMatch, GrepData } from "./types";

export function getGrepChipLabel(
  toolName: string,
  input: unknown,
  output: unknown,
): string | null {
  if (toolName !== GREP_TOOL_NAME) {
    return null;
  }

  const inputRecord = asRecord(input);
  const pattern =
    typeof inputRecord?.pattern === "string"
      ? inputRecord.pattern.trim()
      : "";

  const data = extractGrepData(output);
  const matchCount = data?.totalMatches ?? 0;

  const patternPreview = pattern
    ? pattern.length > 28
      ? `${pattern.slice(0, 28)}…`
      : pattern
    : "";

  if (patternPreview) {
    return `grep: /${patternPreview}/ (${matchCount})`;
  }

  return `grep (${matchCount} matches)`;
}

export function formatGrepOutputForDisplay(output: unknown): {
  pattern: string;
  outputMode: string;
  matches: GrepContentMatch[];
  files: string[];
  counts: GrepCountMatch[];
  totalMatches: number;
  truncated: boolean;
  skippedFiles?: number;
} | null {
  const data = extractGrepData(output);
  if (!data) {
    return null;
  }

  return {
    pattern: data.pattern,
    outputMode: data.outputMode,
    matches: data.matches ?? [],
    files: data.files ?? [],
    counts: data.counts ?? [],
    totalMatches: data.totalMatches,
    truncated: data.truncated,
    skippedFiles: data.skippedFiles,
  };
}

export function extractGrepData(output: unknown): GrepData | null {
  const envelope = asRecord(output);
  if (!envelope || envelope.ok !== true) {
    return null;
  }

  const data = envelope.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  if (typeof record.pattern !== "string") {
    return null;
  }

  return {
    pattern: record.pattern,
    path: typeof record.path === "string" ? record.path : "",
    outputMode: typeof record.outputMode === "string" ? record.outputMode : "content",
    matches: Array.isArray(record.matches)
      ? (record.matches as GrepContentMatch[])
      : undefined,
    files: Array.isArray(record.files)
      ? (record.files as string[])
      : undefined,
    counts: Array.isArray(record.counts)
      ? (record.counts as GrepCountMatch[])
      : undefined,
    totalMatches:
      typeof record.totalMatches === "number" ? record.totalMatches : 0,
    truncated: record.truncated === true,
    skippedFiles:
      typeof record.skippedFiles === "number"
        ? record.skippedFiles
        : undefined,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
