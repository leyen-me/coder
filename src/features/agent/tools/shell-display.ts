import { stripAnsi } from "@/lib/strip-ansi";

import {
  AWAIT_TOOL_NAME,
  KILL_SHELL_TOOL_NAME,
  LIST_SHELLS_TOOL_NAME,
  REMOTE_SHELL_TOOL_NAME,
  SHELL_TOOL_NAME,
} from "./definitions";
import type { ListShellsData, ShellData, ShellStatus } from "./types";

export function getShellChipLabel(
  toolName: string,
  input: unknown,
  output: unknown
): string | null {
  if (toolName === SHELL_TOOL_NAME) {
    return formatShellChipLabel(input, output);
  }

  if (toolName === AWAIT_TOOL_NAME) {
    return formatAwaitChipLabel(input, output);
  }

  if (toolName === LIST_SHELLS_TOOL_NAME) {
    return formatListShellsChipLabel(input, output);
  }

  if (toolName === KILL_SHELL_TOOL_NAME) {
    return formatKillShellChipLabel(input, output);
  }

  return null;
}

export function formatShellOutputForDisplay(output: unknown): string | null {
  const data = extractShellData(output);
  if (!data) {
    return null;
  }

  const parts: string[] = [];
  parts.push(`$ ${data.command}`);
  parts.push(`status: ${data.status}${data.exitCode != null ? ` (exit ${data.exitCode})` : ""}`);
  parts.push(`duration: ${data.durationMs}ms`);

  if (data.stdout) {
    parts.push(formatStreamSection("stdout", data.stdout, data.stdoutTruncated, data.stdoutTotalBytes));
  }

  if (data.stderr) {
    parts.push(formatStreamSection("stderr", data.stderr, data.stderrTruncated, data.stderrTotalBytes));
  }

  if (!data.stdout && !data.stderr) {
    const exitInfo =
      data.exitCode != null ? `exit code ${data.exitCode}` : null;
    const reason =
      exitInfo
        ? `no output, ${exitInfo}`
        : "no output";
    parts.push(`(${reason})`);
  }

  return parts.join("\n\n");
}

function formatShellChipLabel(input: unknown, output: unknown): string {
  const inputRecord = asRecord(input);
  const description =
    typeof inputRecord?.description === "string"
      ? inputRecord.description.trim()
      : "";
  const command =
    typeof inputRecord?.command === "string" ? inputRecord.command.trim() : "";

  const data = extractShellData(output);
  const statusSuffix = data ? ` [${data.status}]` : "";

  if (description) {
    return `shell: ${description}${statusSuffix}`;
  }

  if (command) {
    const preview = command.length > 40 ? `${command.slice(0, 40)}…` : command;
    return `shell: ${preview}${statusSuffix}`;
  }

  return `shell${statusSuffix}`;
}

function formatListShellsChipLabel(input: unknown, output: unknown): string {
  const data = extractListShellsData(output);
  const inputRecord = asRecord(input);
  const statusFilter =
    typeof inputRecord?.status_filter === "string"
      ? inputRecord.status_filter
      : "running";

  if (data) {
    const countLabel = data.total === 1 ? "1 shell" : `${data.total} shells`;
    return `list_shells: ${countLabel} (${statusFilter})`;
  }

  return `list_shells (${statusFilter})`;
}

function formatKillShellChipLabel(input: unknown, output: unknown): string {
  const inputRecord = asRecord(input);
  const shellId =
    typeof inputRecord?.shell_id === "string"
      ? inputRecord.shell_id
      : "shell";

  const envelope = asRecord(output);
  if (envelope?.ok === true) {
    return `kill_shell: ${shellId}`;
  }

  const preview =
    shellId.length > 24 ? `${shellId.slice(0, 24)}…` : shellId;
  return `kill_shell: ${preview}`;
}

function formatAwaitChipLabel(input: unknown, output: unknown): string {
  const data = extractShellData(output);
  const inputRecord = asRecord(input);
  const shellId =
    typeof inputRecord?.shell_id === "string" ? inputRecord.shell_id : "shell";

  if (data?.command) {
    const preview =
      data.command.length > 30 ? `${data.command.slice(0, 30)}…` : data.command;
    return `await: ${preview} [${data.status}]`;
  }

  return `await: ${shellId}${data ? ` [${data.status}]` : ""}`;
}

function formatStreamSection(
  label: string,
  content: string,
  truncated: boolean,
  totalBytes: number
): string {
  const header = truncated
    ? `--- ${label} (${totalBytes} bytes, truncated) ---`
    : `--- ${label} ---`;
  return `${header}\n${stripAnsi(content)}`;
}

export function extractShellData(output: unknown): ShellData | null {
  if (!output || typeof output !== "object") {
    return null;
  }

  const envelope = output as Record<string, unknown>;
  if (envelope.ok !== true || envelope.tool === undefined) {
    return null;
  }

  const data = envelope.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  if (typeof record.command !== "string") {
    return null;
  }

  return {
    command: record.command,
    description:
      typeof record.description === "string" ? record.description : undefined,
    workingDirectory:
      typeof record.workingDirectory === "string"
        ? record.workingDirectory
        : "",
    stdout: typeof record.stdout === "string" ? record.stdout : "",
    stderr: typeof record.stderr === "string" ? record.stderr : "",
    stdoutTruncated: record.stdoutTruncated === true,
    stderrTruncated: record.stderrTruncated === true,
    stdoutTotalBytes:
      typeof record.stdoutTotalBytes === "number" ? record.stdoutTotalBytes : 0,
    stderrTotalBytes:
      typeof record.stderrTotalBytes === "number" ? record.stderrTotalBytes : 0,
    exitCode: typeof record.exitCode === "number" ? record.exitCode : undefined,
    durationMs:
      typeof record.durationMs === "number" ? record.durationMs : 0,
    status: (typeof record.status === "string"
      ? record.status
      : "completed") as ShellStatus,
    shellId: typeof record.shellId === "string" ? record.shellId : undefined,
    source: "agent",
  };
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
    shells: record.shells as ListShellsData["shells"],
    total: record.total,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function canKillShellProcess(status: ShellStatus): boolean {
  return status === "running";
}

export function getShellStatusBadgeVariant(
  status: ShellStatus
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "running":
      return "default";
    case "completed":
      return "secondary";
    case "failed":
      return "destructive";
    case "timeout":
    case "cancelled":
      return "outline";
    default:
      return "secondary";
  }
}

export function getShellStatusColor(status: ShellStatus): string {
  switch (status) {
    case "completed":
      return "text-green-600";
    case "running":
      return "text-blue-600";
    case "failed":
      return "text-destructive";
    case "timeout":
      return "text-amber-600";
    case "cancelled":
      return "text-muted-foreground";
    default:
      return "text-foreground";
  }
}
