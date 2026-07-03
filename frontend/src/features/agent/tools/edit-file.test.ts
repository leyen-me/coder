import { describe, expect, it, vi } from "vitest";

import { EDIT_FILE_TOOL_NAME } from "./definitions";
import { editFileHandler } from "./edit-file";
import { toolFailure, toolSuccess } from "./result";

  isTauri: vi.fn(() => true),
  invoke: vi.fn(),
}));


describe("editFileHandler", () => {
  it("requires path and replacement strings", async () => {
    const result = await editFileHandler(
      { path: "src/main.ts" },
      { workspaceDir: "/tmp/project" }
    );
    expect(result).toEqual(
      toolFailure(
        EDIT_FILE_TOOL_NAME,
        "invalid_arguments",
        "old_string is required and must be a string"
      )
    );
  });

  it("returns structured failures for missing matches", async () => {
    vi.mocked(invoke).mockRejectedValueOnce({
      code: "string_not_found",
      message:
        "old_string was not found in the file. " +
        "This is likely because double quotes or backslashes inside " +
        "the string were incorrectly escaped during JSON serialization.",
    });

    const result = await editFileHandler(
      {
        path: "src/main.ts",
        old_string: "missing",
        new_string: "replacement",
      },
      { workspaceDir: "/tmp/project" }
    );

    expect(result).toEqual(
      toolFailure(
        EDIT_FILE_TOOL_NAME,
        "string_not_found",
        "old_string was not found in the file. " +
          "This is likely because double quotes or backslashes inside " +
          "the string were incorrectly escaped during JSON serialization."
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

    const result = await editFileHandler(
      {
        path: "src/main.ts",
        old_string: "const a = 1;",
        new_string: "const a = 2;",
      },
      { workspaceDir: "/tmp/project" }
    );

    expect(result).toEqual(
      toolSuccess(EDIT_FILE_TOOL_NAME, {
        path: "src/main.ts",
        action: "modified",
        sha256: "abc123",
        bytesWritten: 18,
        linesAdded: 0,
        linesRemoved: 0,
      })
    );
    expect(invoke).toHaveBeenCalledWith("tool_edit_file", {
      workspaceDir: "/tmp/project",
      path: "src/main.ts",
      oldString: "const a = 1;",
      newString: "const a = 2;",
      expectedSha256: undefined,
      replaceAll: false,
      createBackup: false,
      respectGitignore: true,
    });
  });
});
