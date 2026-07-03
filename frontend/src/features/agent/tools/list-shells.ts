import { invoke, isTauri } from "@tauri-apps/api/core";

import { LIST_SHELLS_TOOL_NAME } from "./definitions";
import { toolFailure, toolSuccess } from "./result";
import type { ListShellsData, ShellInfo, ShellStatus, ToolHandler } from "./types";

const MAX_LIST_SHELL_STREAM_CHARS = 4_096;

const SHELL_STATUS_VALUES: ShellStatus[] = [
  "running",
  "completed",
  "failed",
  "timeout",
  "cancelled",
];

type ListShellsArgs = {
  status_filter?: ShellStatus | "all";
  task_id_filter?: string;
};

export const listShellsHandler: ToolHandler = async (rawArgs, _context) => {
  if (!isTauri()) {
    return toolFailure(
      LIST_SHELLS_TOOL_NAME,
      "unsupported_runtime",
      "list_shells is only available in the desktop app"
    );
  }

  const args = parseListShellsArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(LIST_SHELLS_TOOL_NAME, "invalid_arguments", args.message);
  }

  try {
    const statusFilter = args.value.status_filter ?? "running";
    const shells = await invoke<ShellInfo[]>("shell_list", {
      statusFilter,
    });
    const filtered = filterShells(shells, args.value);
    const data: ListShellsData = {
      shells: filtered.map(toListShellEntry),
      total: filtered.length,
    };
    return toolSuccess(LIST_SHELLS_TOOL_NAME, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolFailure(LIST_SHELLS_TOOL_NAME, "execution_failed", message);
  }
};

export function filterShells(
  shells: ShellInfo[],
  args: ListShellsArgs
): ShellInfo[] {
  const statusFilter = args.status_filter ?? "running";

  return shells.filter((shell) => {
    if (statusFilter !== "all" && shell.status !== statusFilter) {
      return false;
    }

    if (args.task_id_filter && shell.taskId !== args.task_id_filter) {
      return false;
    }

    return true;
  });
}

export function truncateShellStream(
  text: string,
  maxChars = MAX_LIST_SHELL_STREAM_CHARS
): { text: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }

  return { text: text.slice(-maxChars), truncated: true };
}

function toListShellEntry(shell: ShellInfo): ListShellsData["shells"][number] {
  const stdout = truncateShellStream(shell.stdout ?? "");
  const stderr = truncateShellStream(shell.stderr ?? "");

  return {
    shellId: shell.shellId,
    command: shell.command,
    description: shell.description,
    workingDirectory: shell.workingDirectory,
    status: shell.status,
    exitCode: shell.exitCode,
    startedAtMs: shell.startedAtMs,
    taskId: shell.taskId,
    stdout: stdout.text,
    stderr: stderr.text,
    stdoutTruncated: stdout.truncated,
    stderrTruncated: stderr.truncated,
    source: shell.source ?? "agent",
  };
}

function parseListShellsArgs(
  rawArgs: unknown
): { ok: true; value: ListShellsArgs } | { ok: false; message: string } {
  if (rawArgs === undefined || rawArgs === null) {
    return { ok: true, value: {} };
  }

  if (typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
    return { ok: false, message: "Arguments must be a JSON object" };
  }

  const record = rawArgs as Record<string, unknown>;
  const statusFilter = record.status_filter;
  if (statusFilter !== undefined) {
    if (typeof statusFilter !== "string") {
      return { ok: false, message: "status_filter must be a string" };
    }

    if (statusFilter !== "all" && !SHELL_STATUS_VALUES.includes(statusFilter as ShellStatus)) {
      return {
        ok: false,
        message:
          "status_filter must be one of: running, completed, failed, timeout, cancelled, all",
      };
    }
  }

  const taskIdFilter = record.task_id_filter;
  if (taskIdFilter !== undefined && typeof taskIdFilter !== "string") {
    return { ok: false, message: "task_id_filter must be a string" };
  }

  return {
    ok: true,
    value: {
      status_filter: statusFilter as ListShellsArgs["status_filter"],
      task_id_filter: taskIdFilter,
    },
  };
}
