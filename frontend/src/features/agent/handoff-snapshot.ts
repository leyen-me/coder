import { apiPost } from "@/lib/api/client";
import type { MessageRecord } from "@/lib/db";
import type { ListShellsData } from "./tools/types";

export type HandoffGitSnapshot = {
  branch: string | null;
  statusShort: string;
  diffStat: string;
  unstagedDiff: string;
  stagedDiff: string;
  recentLog: string;
};

export type HandoffVerificationSnapshot = {
  lastTestCommand: string | null;
  lastTestExitCode: number | null;
  lastBuildCommand: string | null;
  lastBuildExitCode: number | null;
  failingCommandSnippet: string | null;
};

export type HandoffBackgroundJob = {
  shellId: string;
  command: string;
  workingDirectory: string;
  status: string;
  taskId?: string;
  exitCode?: number;
  lastOutput: string | null;
};

export async function collectGitSnapshot(
  workspaceDir: string | null
): Promise<HandoffGitSnapshot | null> {
  const trimmed = workspaceDir?.trim() || null;
  if (!trimmed) {
    return null;
  }

  try {
    return await apiPost<HandoffGitSnapshot>("/api/handoff_git_snapshot", {
      workspaceDir: trimmed,
    });
  } catch {
    return null;
  }
}

export async function collectBackgroundJobSnapshot(
  taskIdFilter?: string | null
): Promise<HandoffBackgroundJob[]> {
  const result = await apiPost<ListShellsData>("/api/list_shells", {
    statusFilter: "all",
  });

  return result.shells
    .filter((shell) => {
      if (!taskIdFilter?.trim()) {
        return false;
      }
      return shell.taskId === taskIdFilter;
    })
    .map((shell) => ({
      shellId: shell.shellId,
      command: shell.command,
      workingDirectory: shell.workingDirectory,
      status: shell.status,
      taskId: shell.taskId,
      exitCode: shell.exitCode,
      lastOutput: extractLastOutputLine(shell.stdout || shell.stderr || ""),
    }));
}

export function collectVerificationSnapshot(
  messages: MessageRecord[]
): HandoffVerificationSnapshot {
  const shellInvocations = messages.flatMap((message) =>
    (message.toolInvocations ?? [])
      .filter((invocation) =>
        invocation.name === "shell" || invocation.name === "remote_shell"
      )
      .map((invocation) => ({
        createdAt: message.createdAt,
        input: invocation.input,
        output: invocation.output,
      }))
  );

  let lastTestCommand: string | null = null;
  let lastTestExitCode: number | null = null;
  let lastBuildCommand: string | null = null;
  let lastBuildExitCode: number | null = null;
  let failingCommandSnippet: string | null = null;

  for (const invocation of shellInvocations) {
    const command = extractShellCommand(invocation.input);
    if (!command) {
      continue;
    }

    const exitCode = extractShellExitCode(invocation.output);
    const normalized = command.toLowerCase();
    if (looksLikeTestCommand(normalized)) {
      lastTestCommand = command;
      lastTestExitCode = exitCode;
      if (exitCode && exitCode !== 0) {
        failingCommandSnippet = extractShellFailureSnippet(invocation.output);
      }
    } else if (looksLikeBuildCommand(normalized)) {
      lastBuildCommand = command;
      lastBuildExitCode = exitCode;
      if (exitCode && exitCode !== 0) {
        failingCommandSnippet = extractShellFailureSnippet(invocation.output);
      }
    }
  }

  return {
    lastTestCommand,
    lastTestExitCode,
    lastBuildCommand,
    lastBuildExitCode,
    failingCommandSnippet,
  };
}

function extractShellCommand(input: unknown): string | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }
  const record = input as Record<string, unknown>;
  const command = record.command;
  return typeof command === "string" && command.trim() ? command.trim() : null;
}

function extractShellExitCode(output: unknown): number | null {
  if (typeof output !== "object" || output === null) {
    return null;
  }
  const record = output as Record<string, unknown>;
  const data =
    typeof record.data === "object" && record.data !== null
      ? (record.data as Record<string, unknown>)
      : record;
  return typeof data.exitCode === "number" ? data.exitCode : null;
}

function extractShellFailureSnippet(output: unknown): string | null {
  if (typeof output !== "object" || output === null) {
    return null;
  }
  const record = output as Record<string, unknown>;
  const data =
    typeof record.data === "object" && record.data !== null
      ? (record.data as Record<string, unknown>)
      : record;
  const text = [data.stderr, data.stdout]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .trim();
  if (!text) {
    return null;
  }
  return text.slice(0, 600);
}

function looksLikeTestCommand(command: string): boolean {
  return /\b(test|vitest|jest|cargo test|pytest|playwright)\b/.test(command);
}

function looksLikeBuildCommand(command: string): boolean {
  return /\b(build|tsc|cargo build|vite build|next build)\b/.test(command);
}

function extractLastOutputLine(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines[lines.length - 1] : null;
}
