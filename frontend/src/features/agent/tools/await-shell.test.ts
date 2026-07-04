import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
  apiPost: vi.fn(),
}));

import { apiPost } from "@/lib/api/client";
import { AWAIT_TOOL_NAME } from "./definitions";
import { awaitShellHandler } from "./await-shell";
import { toolSuccess } from "./result";

describe("awaitShellHandler", () => {
  it("does not require a workspace directory", async () => {
    vi.mocked(apiPost).mockResolvedValue({
      command: "npm test",
      workingDirectory: "/workspace",
      stdout: "ok",
      stderr: "",
      stdoutTruncated: false,
      stderrTruncated: false,
      stdoutTotalBytes: 2,
      stderrTotalBytes: 0,
      exitCode: 0,
      durationMs: 10,
      status: "completed",
      shellId: "shell-1",
    });

    const result = await awaitShellHandler(
      { shell_id: "shell-1" },
      { workspaceDir: null },
    );

    expect(apiPost).toHaveBeenCalledWith("/api/tool_await", {
      shellId: "shell-1",
      blockUntilMs: null,
    });
    expect(result.ok).toBe(true);
    expect(result).toEqual(
      toolSuccess(AWAIT_TOOL_NAME, expect.objectContaining({ shellId: "shell-1" })),
    );
  });
});
