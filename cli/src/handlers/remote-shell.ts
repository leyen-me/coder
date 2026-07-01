import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";

type RemoteShellArgs = {
  target: string;
  command: string;
  description?: string;
  block_until_ms?: number;
};

export const remoteShellHandler: ToolHandler = async (rawArgs, _context) => {
  const args = rawArgs as RemoteShellArgs;

  if (!args.target?.trim() || !args.command?.trim()) {
    return toolFailure("remote_shell", "invalid_arguments", "target and command are required");
  }

  try {
    const configDir = join(homedir(), ".config", "coder", "cli");
    const targetsPath = join(configDir, "remote-targets.json");

    if (!existsSync(targetsPath)) {
      return toolFailure(
        "remote_shell",
        "no_targets",
        "No remote targets configured.",
      );
    }

    const targets = JSON.parse(readFileSync(targetsPath, "utf-8"));
    const target = targets[args.target.trim()];

    if (!target) {
      return toolFailure(
        "remote_shell",
        "target_not_found",
        `Remote target "${args.target}" not found.`,
      );
    }

    const sshCmd = `ssh -o StrictHostKeyChecking=no -p ${target.port || 22} ${target.user}@${target.host} ${JSON.stringify(args.command)}`;

    const stdout = execSync(sshCmd, {
      timeout: args.block_until_ms ?? 30000,
      encoding: "utf-8",
    });

    return toolSuccess("remote_shell", {
      command: args.command,
      target: args.target,
      stdout,
      stderr: "",
      exitCode: 0,
      durationMs: 0,
      status: "completed",
      workingDirectory: "",
      stdoutTruncated: false,
      stderrTruncated: false,
      stdoutTotalBytes: Buffer.byteLength(stdout),
      stderrTotalBytes: 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolFailure("remote_shell", "connection_error", `Failed to execute remote command: ${message}`);
  }
};
