import { invoke, isTauri } from "@tauri-apps/api/core";

import { AgentCancellationError, throwIfAborted } from "../cancellation";
import { SHELL_TOOL_NAME } from "./definitions";
import { toolFailure, toolSuccess } from "./result";
import type { ShellData, ToolHandler } from "./types";
import { getRemoteTarget } from "@/lib/db/remote-targets";

type ShellArgs = {
  command: string;
  description?: string;
  working_directory?: string;
  block_until_ms?: number;
  target?: string;
};

export const shellHandler: ToolHandler = async (rawArgs, context) => {
  if (!isTauri()) {
    return toolFailure(
      SHELL_TOOL_NAME,
      "unsupported_runtime",
      "shell is only available in the desktop app"
    );
  }

  const args = parseShellArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(SHELL_TOOL_NAME, "invalid_arguments", args.message);
  }

  // Remote shells don't need a workspace, only local ones do
  if (!context.workspaceDir && !args.value.target) {
    return toolFailure(
      SHELL_TOOL_NAME,
      "workspace_required",
      "Select a workspace directory before running shell commands"
    );
  }

  throwIfAborted(context.signal, context.taskId);

  // If target is specified, look up the remote config
  let targetConfig = null;
  if (args.value.target) {
    const config = await getRemoteTarget(args.value.target);
    if (!config) {
      return toolFailure(
        SHELL_TOOL_NAME,
        "unknown_target",
        `Remote target "${args.value.target}" not found. Configure it in Settings > Remote Connections first.`
      );
    }
    targetConfig = config;
  }

  try {
    const shellPromise = invoke<ShellData>("tool_shell", {
      workspaceDir: context.workspaceDir,
      command: args.value.command,
      description: args.value.description ?? null,
      workingDirectory: args.value.working_directory ?? null,
      blockUntilMs: args.value.block_until_ms ?? null,
      taskId: context.taskId ?? null,
      target: args.value.target ?? null,
      targetConfig,
    });
    const data = context.signal
      ? await raceShellWithAbort(shellPromise, context.signal, context.taskId)
      : await shellPromise;
    return toolSuccess(SHELL_TOOL_NAME, data);
  } catch (error) {
    if (error instanceof AgentCancellationError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    return toolFailure(SHELL_TOOL_NAME, "execution_failed", message);
  }
};

async function raceShellWithAbort(
  shellPromise: Promise<ShellData>,
  signal: AbortSignal,
  taskId?: string
): Promise<ShellData> {
  throwIfAborted(signal, taskId);

  let cleanup = () => {};
  try {
    return await Promise.race([
      shellPromise,
      new Promise<never>((_, reject) => {
        const onAbort = () => {
          cleanup();
          void killShellsForTask(taskId).finally(() => {
            reject(new AgentCancellationError(taskId));
          });
        };

        cleanup = () => {
          signal.removeEventListener("abort", onAbort);
        };
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    cleanup();
  }
}

async function killShellsForTask(taskId?: string): Promise<void> {
  if (!taskId) {
    return;
  }

  try {
    await invoke("shell_kill_by_task", { taskId });
  } catch {
    // Best effort only. Cancellation still needs to unblock the agent loop.
  }
}

function parseShellArgs(
  rawArgs: unknown
): { ok: true; value: ShellArgs } | { ok: false; message: string } {
  if (rawArgs === undefined || rawArgs === null) {
    return { ok: false, message: "command is required" };
  }

  if (typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
    return { ok: false, message: "Arguments must be a JSON object" };
  }

  const record = rawArgs as Record<string, unknown>;
  const command = record.command;

  if (typeof command !== "string" || command.trim().length === 0) {
    return {
      ok: false,
      message: "command is required and must be a non-empty string",
    };
  }

  const description = record.description;
  if (description !== undefined && typeof description !== "string") {
    return { ok: false, message: "description must be a string" };
  }

  const workingDirectory = record.working_directory;
  if (workingDirectory !== undefined && typeof workingDirectory !== "string") {
    return { ok: false, message: "working_directory must be a string" };
  }

  const blockUntilMs = record.block_until_ms;
  if (blockUntilMs !== undefined && typeof blockUntilMs !== "number") {
    return { ok: false, message: "block_until_ms must be a number" };
  }

  const target = record.target;
  if (target !== undefined && typeof target !== "string") {
    return { ok: false, message: "target must be a string" };
  }

  return {
    ok: true,
    value: {
      command,
      description,
      working_directory: workingDirectory,
      block_until_ms: blockUntilMs,
      target,
    },
  };
}
