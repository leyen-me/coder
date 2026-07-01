import { invoke, isTauri } from "@tauri-apps/api/core";

import { AgentCancellationError } from "../cancellation";
import { REMOTE_SHELL_TOOL_NAME } from "./definitions";
import { toolFailure, toolSuccess } from "./result";
import type { RemoteShellData, ToolHandler } from "./types";
import { getRemoteTarget } from "@/lib/db/remote-targets";

type RemoteShellArgs = {
  target: string;
  command: string;
  description?: string;
  block_until_ms?: number;
};

export const remoteShellHandler: ToolHandler = async (rawArgs, context) => {
  if (!isTauri()) {
    return toolFailure(
      REMOTE_SHELL_TOOL_NAME,
      "unsupported_runtime",
      "remote_shell is only available in the desktop app"
    );
  }

  const args = parseRemoteShellArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(REMOTE_SHELL_TOOL_NAME, "invalid_arguments", args.message);
  }

  // Look up the remote target config
  const config = await getRemoteTarget(args.value.target);
  if (!config) {
    return toolFailure(
      REMOTE_SHELL_TOOL_NAME,
      "unknown_target",
      `Remote target "${args.value.target}" not found. Configure it in Settings > Remote Connections first.`
    );
  }
  if (!config.enabled) {
    return toolFailure(
      REMOTE_SHELL_TOOL_NAME,
      "target_disabled",
      `Remote target "${args.value.target}" is disabled. Enable it in Settings > Remote Connections to use it.`
    );
  }

  try {
    const data = await invoke<RemoteShellData>("tool_remote_shell", {
      command: args.value.command,
      description: args.value.description ?? null,
      config,
      blockUntilMs: args.value.block_until_ms ?? null,
      taskId: context?.taskId ?? null,
    });
    return toolSuccess(REMOTE_SHELL_TOOL_NAME, data);
  } catch (error) {
    if (error instanceof AgentCancellationError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    return toolFailure(REMOTE_SHELL_TOOL_NAME, "execution_failed", message);
  }
};

function parseRemoteShellArgs(
  rawArgs: unknown
): { ok: true; value: RemoteShellArgs } | { ok: false; message: string } {
  if (rawArgs === undefined || rawArgs === null) {
    return { ok: false, message: "target and command are required" };
  }

  if (typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
    return { ok: false, message: "Arguments must be a JSON object" };
  }

  const record = rawArgs as Record<string, unknown>;
  const target = record.target;
  const command = record.command;

  if (typeof target !== "string" || target.trim().length === 0) {
    return { ok: false, message: "target is required and must be a non-empty string" };
  }

  if (typeof command !== "string" || command.trim().length === 0) {
    return { ok: false, message: "command is required and must be a non-empty string" };
  }

  const description = record.description;
  if (description !== undefined && typeof description !== "string") {
    return { ok: false, message: "description must be a string" };
  }

  const block_until_ms = record.block_until_ms;
  if (block_until_ms !== undefined && typeof block_until_ms !== "number") {
    return { ok: false, message: "block_until_ms must be a number" };
  }

  return {
    ok: true,
    value: { target, command, description, block_until_ms },
  };
}
