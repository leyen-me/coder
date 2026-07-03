import {
  KILL_SHELL_TOOL_NAME,
  LIST_SHELLS_TOOL_NAME,
  READ_SHELL_LOGS_TOOL_NAME,
} from "./definitions";
import type {
  KillShellData,
  ListShellsData,
  ListShellsEntry,
  ReadShellLogsData,
  ShellStatus,
} from "./types";

// ---------------------------------------------------------------------------
// ListShells display
// ---------------------------------------------------------------------------

export function getListShellsChipLabel(
  toolName: string,
  input: unknown,
  output: unknown,
): string | null {
  if (toolName !== LIST_SHELLS_TOOL_NAME) {
    return null;
  }

  const inputRecord = asRecord(input);
  const statusFilter =
    typeof inputRecord?.status_filter === "string"
      ? inputRecord.status_filter
      : "running";

  const data = extractListShellsData(output);
  const count = data?.total ?? 0;
  const countLabel = count === 1 ? "1 shell" : `${count} shells`;

  return `list_shells: ${countLabel} (${statusFilter})`;
}

export function formatListShellsOutputForDisplay(
  output: unknown,
): { total: number; shells: ListShellsEntry[] } | null {
  const data = extractListShellsData(output);
  if (!data) {
    return null;
  }

  return { total: data.total, shells: data.shells };
}

function extractListShellsData(output: unknown): ListShellsData | null {
  const envelope = asRecord(output);
  if (!envelope || envelope.ok !== true) {
    return null;
  }

  const data = envelope.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  if (!Array.isArray(record.shells) || typeof record.total !== "number") {
    return null;
  }

  return {
    shells: record.shells as ListShellsEntry[],
    total: record.total,
  };
}

// ---------------------------------------------------------------------------
// ReadShellLogs display
// ---------------------------------------------------------------------------

export function getReadShellLogsChipLabel(
  toolName: string,
  input: unknown,
  output: unknown,
): string | null {
  if (toolName !== READ_SHELL_LOGS_TOOL_NAME) {
    return null;
  }

  const inputRecord = asRecord(input);
  const shellId =
    typeof inputRecord?.shell_id === "string"
      ? inputRecord.shell_id
      : "";
  const stream =
    typeof inputRecord?.stream === "string" ? inputRecord.stream : "stdout";

  const shortenedShellId = shellId.length > 16
    ? `${shellId.slice(0, 16)}…`
    : shellId;

  const data = extractReadShellLogsData(output);
  if (data) {
    const byteInfo =
      data.totalBytes > 0 ? ` (${formatBytes(data.totalBytes)})` : "";
    return `read_shell_logs: ${shortenedShellId} [${stream}]${byteInfo}`;
  }

  return shortenedShellId
    ? `read_shell_logs: ${shortenedShellId} [${stream}]`
    : READ_SHELL_LOGS_TOOL_NAME;
}

export function formatReadShellLogsOutputForDisplay(
  output: unknown,
): ReadShellLogsData | null {
  return extractReadShellLogsData(output);
}

function extractReadShellLogsData(
  output: unknown,
): ReadShellLogsData | null {
  const envelope = asRecord(output);
  if (!envelope || envelope.ok !== true) {
    return null;
  }

  const data = envelope.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  if (typeof record.shellId !== "string" || typeof record.data !== "string") {
    return null;
  }

  return {
    shellId: record.shellId,
    stream: typeof record.stream === "string" ? record.stream : "stdout",
    data: record.data,
    offset: typeof record.offset === "number" ? record.offset : 0,
    totalBytes: typeof record.totalBytes === "number" ? record.totalBytes : 0,
    truncated: record.truncated === true,
  };
}

// ---------------------------------------------------------------------------
// KillShell display
// ---------------------------------------------------------------------------

export function getKillShellChipLabel(
  toolName: string,
  input: unknown,
  output: unknown,
): string | null {
  if (toolName !== KILL_SHELL_TOOL_NAME) {
    return null;
  }

  const inputRecord = asRecord(input);
  const shellId =
    typeof inputRecord?.shell_id === "string" ? inputRecord.shell_id : "";

  const shortenedShellId = shellId.length > 20
    ? `${shellId.slice(0, 20)}…`
    : shellId;

  if (!shellId) {
    return KILL_SHELL_TOOL_NAME;
  }

  const data = extractKillShellData(output);
  const suffix =
    data !== null
      ? data.killed
        ? " ✓"
        : " ✗"
      : "";

  return `kill_shell: ${shortenedShellId}${suffix}`;
}

export function extractKillShellData(output: unknown): KillShellData | null {
  const envelope = asRecord(output);
  if (!envelope || envelope.ok !== true) {
    return null;
  }

  const data = envelope.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  if (typeof record.shellId !== "string") {
    return null;
  }

  return {
    shellId: record.shellId,
    killed: record.killed === true,
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function getShellStatusBadgeStyle(
  status: ShellStatus,
): string {
  switch (status) {
    case "completed":
      return "bg-success/10 text-success";
    case "running":
      return "bg-blue-500/10 text-blue-600";
    case "failed":
      return "bg-destructive/10 text-destructive";
    case "timeout":
      return "bg-amber-500/10 text-amber-600";
    case "cancelled":
      return "bg-muted-foreground/10 text-muted-foreground";
    default:
      return "bg-muted-foreground/10 text-muted-foreground";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
