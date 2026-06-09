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
});
