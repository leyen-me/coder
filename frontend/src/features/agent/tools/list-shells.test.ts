import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
  apiPost: vi.fn(),
}));

import { apiPost } from "@/lib/api/client";
import { LIST_SHELLS_TOOL_NAME } from "./definitions";
import {
  filterShells,
  listShellsHandler,
  truncateShellStream,
} from "./list-shells";
import { toolFailure, toolSuccess } from "./result";
import type { ListShellsData, ShellInfo } from "./types";


const sampleShells: ShellInfo[] = [
  {
    shellId: "shell-1",
    command: "npm run dev",
    workingDirectory: "/workspace",
    status: "running",
    startedAtMs: 1000,
    taskId: "task-a",
    stdout: "ready",
    stderr: "",
    source: "agent",
  },
  {
    shellId: "shell-2",
    command: "npm test",
    workingDirectory: "/workspace",
    status: "completed",
    exitCode: 0,
    startedAtMs: 2000,
    taskId: "task-b",
    stdout: "passed",
    stderr: "",
    source: "agent",
  },
];

describe("listShellsHandler", () => {
  it("rejects invalid status_filter values", async () => {
    const result = await listShellsHandler(
      { status_filter: "unknown" },
      { workspaceDir: "/tmp/project" }
    );

    expect(result).toEqual(
      toolFailure(
        LIST_SHELLS_TOOL_NAME,
        "invalid_arguments",
        "status_filter must be one of: running, completed, failed, timeout, cancelled, all"
      )
    );
  });

  it("defaults to running shells only", async () => {
    vi.mocked(apiPost).mockResolvedValueOnce(sampleShells);

    const result = await listShellsHandler({}, { workspaceDir: "/tmp/project" });

    expect(result).toEqual(
      toolSuccess(LIST_SHELLS_TOOL_NAME, {
        shells: [
          {
            shellId: "shell-1",
            command: "npm run dev",
            workingDirectory: "/workspace",
            status: "running",
            startedAtMs: 1000,
            taskId: "task-a",
            stdout: "ready",
            stderr: "",
            stdoutTruncated: false,
            stderrTruncated: false,
            source: "agent",
          },
        ],
        total: 1,
      })
    );
    expect(apiPost).toHaveBeenCalledWith("/api/shell_list", {
      statusFilter: "running",
    });
  });

  it("filters by status and task id", async () => {
    vi.mocked(apiPost).mockResolvedValueOnce(sampleShells);

    const result = await listShellsHandler(
      { status_filter: "all", task_id_filter: "task-b" },
      { workspaceDir: "/tmp/project" }
    );

    expect(result).toEqual(
      toolSuccess(LIST_SHELLS_TOOL_NAME, {
        shells: [
          {
            shellId: "shell-2",
            command: "npm test",
            workingDirectory: "/workspace",
            status: "completed",
            exitCode: 0,
            startedAtMs: 2000,
            taskId: "task-b",
            stdout: "passed",
            stderr: "",
            stdoutTruncated: false,
            stderrTruncated: false,
            source: "agent",
          },
        ],
        total: 1,
      })
    );
    expect(apiPost).toHaveBeenCalledWith("/api/shell_list", {
      statusFilter: "all",
    });
  });

  it("truncates long stdout and stderr tails", async () => {
    const longOutput = "x".repeat(5_000);
    vi.mocked(apiPost).mockResolvedValueOnce([
      {
        shellId: "shell-3",
        command: "cat big.log",
        workingDirectory: "/workspace",
        status: "running",
        startedAtMs: 3000,
        stdout: longOutput,
        stderr: longOutput,
      },
    ]);

    const result = await listShellsHandler(
      { status_filter: "all" },
      { workspaceDir: "/tmp/project" }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const data = result.data as ListShellsData;
    expect(data.shells[0]?.stdout.length).toBe(4_096);
    expect(data.shells[0]?.stderr.length).toBe(4_096);
    expect(data.shells[0]?.stdoutTruncated).toBe(true);
    expect(data.shells[0]?.stderrTruncated).toBe(true);
  });
});

describe("filterShells", () => {
  it("keeps only running shells by default", () => {
    expect(filterShells(sampleShells, {})).toHaveLength(1);
    expect(filterShells(sampleShells, {})[0]?.shellId).toBe("shell-1");
  });
});

describe("truncateShellStream", () => {
  it("returns unchanged text when under the limit", () => {
    expect(truncateShellStream("hello", 10)).toEqual({
      text: "hello",
      truncated: false,
    });
  });

  it("keeps the tail when text exceeds the limit", () => {
    expect(truncateShellStream("abcdefghij", 4)).toEqual({
      text: "ghij",
      truncated: true,
    });
  });
});
