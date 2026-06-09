import { describe, expect, it, vi } from "vitest";

import { REPLACE_FILE_TOOL_NAME } from "./definitions";
import { replaceFileHandler } from "./replace-file";
import { toolFailure, toolSuccess } from "./result";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => true),
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

describe("replaceFileHandler", () => {
  it("requires a workspace directory", async () => {
    const result = await replaceFileHandler(
      { path: "src/main.ts", content: "export {}\n" },
      { workspaceDir: null }
    );
    expect(result).toEqual(
      toolFailure(
        REPLACE_FILE_TOOL_NAME,
        "workspace_required",
        "Select a workspace directory before replacing files"
      )
    );
  });

  it("returns structured failures for hash guard errors", async () => {
    vi.mocked(invoke).mockRejectedValueOnce({
      code: "file_changed",
      message: "File changed since it was last read; re-read the file and retry",
    });

    const result = await replaceFileHandler(
      {
        path: "src/main.ts",
        content: "export {}\n",
        expected_sha256: "deadbeef",
      },
      { workspaceDir: "/tmp/project" }
    );

    expect(result).toEqual(
      toolFailure(
        REPLACE_FILE_TOOL_NAME,
        "file_changed",
        "File changed since it was last read; re-read the file and retry"
      )
    );
  });

  it("returns successful replacements", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      path: "src/main.ts",
      action: "replaced",
      sha256: "abc123",
      bytesWritten: 12,
      linesAdded: 1,
      linesRemoved: 1,
      backupPath: ".history/src__main.ts.001",
    });

    const result = await replaceFileHandler(
      { path: "src/main.ts", content: "export {}\n" },
      { workspaceDir: "/tmp/project" }
    );

    expect(result).toEqual(
      toolSuccess(REPLACE_FILE_TOOL_NAME, {
        path: "src/main.ts",
        action: "replaced",
        sha256: "abc123",
        bytesWritten: 12,
        linesAdded: 1,
        linesRemoved: 1,
        backupPath: ".history/src__main.ts.001",
      })
    );
  });
});
