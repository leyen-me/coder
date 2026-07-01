/**
 * Shell process registry for the Coder CLI.
 * Tracks shell processes started by the agent.
 */

import { spawn, type ChildProcess } from "node:child_process";
import type { ShellData, ShellInfo, ShellStatus } from "./types";
import { resolve } from "node:path";

type ManagedShell = {
  shellId: string;
  command: string;
  description?: string;
  process: ChildProcess;
  status: ShellStatus;
  exitCode?: number;
  stdout: string;
  stderr: string;
  workingDirectory: string;
  startedAtMs: number;
  taskId?: string;
};

const shells = new Map<string, ManagedShell>();

let shellCounter = 0;

function generateShellId(): string {
  shellCounter++;
  return `shell-${Date.now()}-${shellCounter}`;
}

export async function executeShell(
  command: string,
  options: {
    workingDirectory?: string;
    description?: string;
    blockUntilMs?: number;
    taskId?: string;
    workspaceDir?: string | null;
  },
): Promise<ShellData> {
  const shellId = generateShellId();
  const cwd = options.workspaceDir
    ? options.workingDirectory
      ? resolve(options.workspaceDir, options.workingDirectory)
      : options.workspaceDir
    : process.cwd();

  const startTime = Date.now();
  const blockMs = options.blockUntilMs ?? 30000;

  // Determine shell
  const isWindows = process.platform === "win32";
  const shellCmd = isWindows ? "cmd.exe" : "/bin/sh";
  const shellArgs = isWindows ? ["/c", command] : ["-c", command];

  return new Promise((resolvePromise) => {
    const child = spawn(shellCmd, shellArgs, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const shell: ManagedShell = {
      shellId,
      command,
      description: options.description,
      process: child,
      status: "running",
      stdout,
      stderr,
      workingDirectory: cwd,
      startedAtMs: startTime,
      taskId: options.taskId,
    };

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
      shell.stdout = stdout;
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
      shell.stderr = stderr;
    });

    const finish = (status: ShellStatus, code?: number) => {
      if (settled) return;
      settled = true;
      shell.status = status;
      shell.exitCode = code;
      const duration = Date.now() - startTime;

      const stdoutBytes = Buffer.byteLength(stdout);
      const stderrBytes = Buffer.byteLength(stderr);

      // Remove from registry if background shell
      // (sync shells are removed automatically)
      if (blockMs <= 0) {
        // Background — keep in registry
        shells.set(shellId, shell);
      } else {
        shells.delete(shellId);
      }

      resolvePromise({
        command,
        description: options.description,
        workingDirectory: cwd,
        stdout,
        stderr,
        stdoutTruncated: stdoutBytes > 65536,
        stderrTruncated: stderrBytes > 65536,
        stdoutTotalBytes: stdoutBytes,
        stderrTotalBytes: stderrBytes,
        exitCode: code,
        durationMs: duration,
        status,
        shellId: blockMs <= 0 ? shellId : undefined,
      });
    };

    child.on("error", (err) => {
      stderr += err.message;
      finish("failed", 1);
    });

    child.on("close", (code) => {
      finish(code === 0 ? "completed" : "failed", code ?? undefined);
    });

    // Timeout handling
    if (blockMs > 0) {
      const timeout = setTimeout(() => {
        if (!settled) {
          child.kill();
          finish("timeout", undefined);
        }
      }, blockMs);

      child.on("close", () => clearTimeout(timeout));
    }

    if (blockMs <= 0) {
      // Background mode — return immediately
      shells.set(shellId, shell);
      const stdoutBytes = Buffer.byteLength(stdout);
      const stderrBytes = Buffer.byteLength(stderr);
      resolvePromise({
        command,
        description: options.description,
        workingDirectory: cwd,
        stdout: "",
        stderr: "",
        stdoutTruncated: false,
        stderrTruncated: false,
        stdoutTotalBytes: 0,
        stderrTotalBytes: 0,
        exitCode: undefined,
        durationMs: 0,
        status: "running",
        shellId,
      });
    }
  });
}

export async function awaitShell(
  shellId: string,
  blockUntilMs: number = 30000,
): Promise<ShellData> {
  const shell = shells.get(shellId);
  if (!shell) {
    return {
      command: "",
      workingDirectory: "",
      stdout: "",
      stderr: "",
      stdoutTruncated: false,
      stderrTruncated: false,
      stdoutTotalBytes: 0,
      stderrTotalBytes: 0,
      durationMs: 0,
      status: "completed",
      shellId,
    };
  }

  // Wait for the process to complete (or timeout)
  return new Promise((resolvePromise) => {
    const startTime = Date.now();

    const checkProcess = () => {
      if (shell.exitCode !== undefined || shell.status !== "running") {
        const duration = Date.now() - startTime;
        const stdoutBytes = Buffer.byteLength(shell.stdout);
        const stderrBytes = Buffer.byteLength(shell.stderr);
        resolvePromise({
          command: shell.command,
          description: shell.description,
          workingDirectory: shell.workingDirectory,
          stdout: shell.stdout,
          stderr: shell.stderr,
          stdoutTruncated: stdoutBytes > 65536,
          stderrTruncated: stderrBytes > 65536,
          stdoutTotalBytes: stdoutBytes,
          stderrTotalBytes: stderrBytes,
          exitCode: shell.exitCode,
          durationMs: duration,
          status: shell.status,
          shellId,
        });
        return;
      }

      if (Date.now() - startTime > blockUntilMs) {
        const duration = Date.now() - startTime;
        const stdoutBytes = Buffer.byteLength(shell.stdout);
        const stderrBytes = Buffer.byteLength(shell.stderr);
        resolvePromise({
          command: shell.command,
          description: shell.description,
          workingDirectory: shell.workingDirectory,
          stdout: shell.stdout,
          stderr: shell.stderr,
          stdoutTruncated: stdoutBytes > 65536,
          stderrTruncated: stderrBytes > 65536,
          stdoutTotalBytes: stdoutBytes,
          stderrTotalBytes: stderrBytes,
          exitCode: shell.exitCode,
          durationMs: duration,
          status: shell.status,
          shellId,
        });
        return;
      }

      setTimeout(checkProcess, 50);
    };

    // Also listen for close event
    shell.process.on("close", () => {
      checkProcess();
    });

    checkProcess();
  });
}

export function listShells(statusFilter?: string): ShellInfo[] {
  const result: ShellInfo[] = [];

  for (const shell of shells.values()) {
    if (statusFilter && shell.status !== statusFilter && statusFilter !== "all") {
      continue;
    }

    result.push({
      shellId: shell.shellId,
      command: shell.command,
      description: shell.description,
      workingDirectory: shell.workingDirectory,
      status: shell.status,
      exitCode: shell.exitCode,
      startedAtMs: shell.startedAtMs,
      taskId: shell.taskId,
      stdout: shell.stdout,
      stderr: shell.stderr,
      stdoutTruncated: Buffer.byteLength(shell.stdout) > 65536,
      stderrTruncated: Buffer.byteLength(shell.stderr) > 65536,
    });
  }

  return result;
}

export function killShell(shellId: string): boolean {
  const shell = shells.get(shellId);
  if (!shell) return false;

  try {
    shell.process.kill("SIGTERM");
    shell.status = "cancelled";
    setTimeout(() => {
      try {
        shell.process.kill("SIGKILL");
      } catch {
        // Already dead
      }
    }, 2000);
    return true;
  } catch {
    return false;
  }
}

export function readShellLogs(
  shellId: string,
  stream: "stdout" | "stderr",
  offset: number = 0,
  limit: number = 4096,
): { data: string; offset: number; totalBytes: number; truncated: boolean } {
  const shell = shells.get(shellId);
  if (!shell) {
    return { data: "", offset: 0, totalBytes: 0, truncated: false };
  }

  const content = stream === "stdout" ? shell.stdout : shell.stderr;
  const totalBytes = Buffer.byteLength(content);
  const sliced = content.slice(offset, offset + limit);

  return {
    data: sliced,
    offset: offset + sliced.length,
    totalBytes,
    truncated: offset + limit < totalBytes,
  };
}
