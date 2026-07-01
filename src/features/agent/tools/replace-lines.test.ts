import { describe, expect, it, vi } from "vitest";

import { REPLACE_LINES_TOOL_NAME } from "./definitions";
import { replaceLinesHandler } from "./replace-lines";
import { toolFailure, toolSuccess } from "./result";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => true),
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

describe("replaceLinesHandler", () => {
  it("requires all arguments", async () => {
    const result = await replaceLinesHandler(
      { path: "src/main.ts" },
      { workspaceDir: "/tmp/project" }
    );
    expect(result).toEqual(
      toolFailure(
        REPLACE_LINES_TOOL_NAME,
        "invalid_arguments",
        "start_line is required and must be a positive integer"
      )
    );
  });

  it("rejects non-integer start_line", async () => {
    const result = await replaceLinesHandler(
      {
        path: "src/main.ts",
        start_line: 1.5,
        end_line: 3,
        new_content: "replacement",
      },
      { workspaceDir: "/tmp/project" }
    );
    expect(result).toEqual(
      toolFailure(
        REPLACE_LINES_TOOL_NAME,
        "invalid_arguments",
        "start_line is required and must be a positive integer"
      )
    );
  });

  it("rejects start_line > end_line", async () => {
    const result = await replaceLinesHandler(
      {
        path: "src/main.ts",
        start_line: 5,
        end_line: 3,
        new_content: "replacement",
      },
      { workspaceDir: "/tmp/project" }
    );
    expect(result).toEqual(
      toolFailure(
        REPLACE_LINES_TOOL_NAME,
        "invalid_arguments",
        "start_line must be <= end_line"
      )
    );
  });

  it("returns successful edits", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      path: "src/main.ts",
      action: "modified",
      sha256: "abc123",
      bytesWritten: 18,
      linesAdded: 0,
      linesRemoved: 0,
    });

    const result = await replaceLinesHandler(
      {
        path: "src/main.ts",
        start_line: 2,
        end_line: 3,
        new_content: "const b = 2;\nconst c = 3;",
      },
      { workspaceDir: "/tmp/project" }
    );

    expect(result).toEqual(
      toolSuccess(REPLACE_LINES_TOOL_NAME, {
        path: "src/main.ts",
        action: "modified",
        sha256: "abc123",
        bytesWritten: 18,
        linesAdded: 0,
        linesRemoved: 0,
      })
    );
    expect(invoke).toHaveBeenCalledWith("tool_replace_lines", {
      workspaceDir: "/tmp/project",
      path: "src/main.ts",
      startLine: 2,
      endLine: 3,
      newContent: "const b = 2;\nconst c = 3;",
      expectedSha256: undefined,
      createBackup: false,
      respectGitignore: true,
    });
  });

  it("returns structured failures for invalid range", async () => {
    vi.mocked(invoke).mockRejectedValueOnce({
      code: "invalid_range",
      message: "start_line (10) exceeds file line count (5)",
    });

    const result = await replaceLinesHandler(
      {
        path: "src/main.ts",
        start_line: 10,
        end_line: 12,
        new_content: "x",
      },
      { workspaceDir: "/tmp/project" }
    );

    expect(result).toEqual(
      toolFailure(
        REPLACE_LINES_TOOL_NAME,
        "invalid_range",
        "start_line (10) exceeds file line count (5)"
      )
    );
  });
});
