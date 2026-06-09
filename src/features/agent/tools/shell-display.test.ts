import { describe, expect, it } from "vitest";

import {
  formatShellOutputForDisplay,
  getShellChipLabel,
} from "./shell-display";

describe("shell-display", () => {
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
