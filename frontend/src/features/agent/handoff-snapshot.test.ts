import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
  apiPost: vi.fn(),
}));

import { apiPost } from "@/lib/api/client";
import { collectBackgroundJobSnapshot } from "./handoff-snapshot";

describe("handoff-snapshot", () => {
  beforeEach(() => {
    vi.mocked(apiPost).mockReset();
  });

  it("filters background jobs to the current task only", async () => {
    vi.mocked(apiPost).mockResolvedValue({
      shells: [
        {
          shellId: "shell-1",
          command: "pnpm dev",
          workingDirectory: "/workspace",
          status: "running",
          taskId: "task-1",
          stdout: "ready\nhttp://localhost:1420",
          stderr: "",
          stdoutTruncated: false,
          stderrTruncated: false,
          source: "agent",
        },
        {
          shellId: "shell-2",
          command: "pnpm test",
          workingDirectory: "/workspace",
          status: "running",
          taskId: "task-2",
          stdout: "running",
          stderr: "",
          stdoutTruncated: false,
          stderrTruncated: false,
          source: "agent",
        },
      ],
      total: 2,
    });

    const jobs = await collectBackgroundJobSnapshot("task-1");

    expect(jobs).toEqual([
      {
        shellId: "shell-1",
        command: "pnpm dev",
        workingDirectory: "/workspace",
        status: "running",
        taskId: "task-1",
        exitCode: undefined,
        lastOutput: "http://localhost:1420",
      },
    ]);
  });
});
