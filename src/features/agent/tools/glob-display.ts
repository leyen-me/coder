import { GLOB_TOOL_NAME } from "./definitions";
import type { GlobData } from "./types";

export function getGlobChipLabel(
  toolName: string,
  input: unknown,
  output: unknown,
): string | null {
  if (toolName !== GLOB_TOOL_NAME) {
    return null;
  }

  const inputRecord = asRecord(input);
  const pattern =
    typeof inputRecord?.glob_pattern === "string"
      ? inputRecord.glob_pattern.trim()
      : "";

  const data = extractGlobData(output);
  const matchCount = data?.totalMatches ?? 0;

  const patternPreview = pattern
    ? pattern.length > 28
      ? `${pattern.slice(0, 28)}…`
      : pattern
    : "";

  if (patternPreview) {
    return `glob: ${patternPreview} (${matchCount})`;
  }

  return `glob (${matchCount} matches)`;
}

export function formatGlobOutputForDisplay(output: unknown): {
  pattern: string;
  targetDirectory: string;
  matches: string[];
  totalMatches: number;
  truncated: boolean;
} | null {
  const data = extractGlobData(output);
  if (!data) {
    return null;
  }

  return {
    pattern: data.pattern,
    targetDirectory: data.targetDirectory,
    matches: data.matches,
    totalMatches: data.totalMatches,
    truncated: data.truncated,
  };
}

export function extractGlobData(output: unknown): GlobData | null {
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
    targetDirectory:
      typeof record.targetDirectory === "string"
        ? record.targetDirectory
        : "",
    matches: Array.isArray(record.matches)
      ? (record.matches as string[])
      : [],
    totalMatches:
      typeof record.totalMatches === "number" ? record.totalMatches : 0,
    truncated: record.truncated === true,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
