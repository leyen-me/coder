import { describe, expect, it } from "vitest";

import {
  canKillShellProcess,
  formatShellOutputForDisplay,
  getShellChipLabel,
} from "./shell-display";

describe("shell-display", () => {
  it("allows killing running and timed-out background shells", () => {
    expect(canKillShellProcess("running")).toBe(true);
    expect(canKillShellProcess("timeout")).toBe(true);
    expect(canKillShellProcess("completed")).toBe(false);
    expect(canKillShellProcess("cancelled")).toBe(false);
  });

  it("formats shell chip label from description", () => {
    const label = getShellChipLabel(
      "shell",
      { command: "npm test", description: "Run tests" },
      null
    );
    expect(label).toBe("shell: Run tests");
  });

  it("formats shell output with stdout and stderr", () => {
    const output = formatShellOutputForDisplay({
      ok: true,
      tool: "shell",
      data: {
        command: "echo hi",
        workingDirectory: "/workspace",
        stdout: "hi\n",
        stderr: "",
        stdoutTruncated: false,
        stderrTruncated: false,
        stdoutTotalBytes: 3,
        stderrTotalBytes: 0,
        exitCode: 0,
        durationMs: 12,
        status: "completed",
      },
    });

    expect(output).toContain("$ echo hi");
    expect(output).toContain("status: completed");
    expect(output).toContain("--- stdout ---");
  });

  it("strips ANSI color codes from shell output", () => {
    const output = formatShellOutputForDisplay({
      ok: true,
      tool: "shell",
      data: {
        command: "npm run dev",
        workingDirectory: "/workspace/vue-app",
        stdout:
          "\u001B[32m\u001B[1mVITE\u001B[22m v8.0.16\u001B[39m  \u001B[2mready in \u001B[0m\u001B[1m341\u001B[22m\u001B[2m\u001B[0m ms\u001B[22m\n",
        stderr: "",
        stdoutTruncated: false,
        stderrTruncated: false,
        stdoutTotalBytes: 80,
        stderrTotalBytes: 0,
        exitCode: 0,
        durationMs: 5000,
        status: "timeout",
      },
    });

    expect(output).toContain("VITE v8.0.16  ready in 341 ms");
    expect(output).not.toContain("\u001B[32m");
  });

  it("formats timed-out shell output so AI and UI can read partial stdout", () => {
    const output = formatShellOutputForDisplay({
      ok: true,
      tool: "shell",
      data: {
        command: "npm create vite@latest vue-app -- --template vue",
        workingDirectory: "/workspace",
        stdout: "> create-vite vue-app --template vue\n",
        stderr: "",
        stdoutTruncated: false,
        stderrTruncated: false,
        stdoutTotalBytes: 35,
        stderrTotalBytes: 0,
        durationMs: 60000,
        status: "timeout",
      },
    });

    expect(output).toContain("status: timeout");
    expect(output).toContain("create-vite");
  });
});
