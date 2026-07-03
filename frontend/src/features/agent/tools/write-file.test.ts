import { describe, expect, it, vi } from "vitest";

import { WRITE_FILE_TOOL_NAME } from "./definitions";
import { toolFailure, toolSuccess } from "./result";
import { writeFileHandler } from "./write-file";

  isTauri: vi.fn(() => true),
  invoke: vi.fn(),
}));


describe("writeFileHandler", () => {
  it("requires a workspace directory", async () => {
    const result = await writeFileHandler(
      { path: "src/main.ts", content: "export {}\n" },
      { workspaceDir: null }
    );
    expect(result).toEqual(
      toolFailure(
        WRITE_FILE_TOOL_NAME,
        "workspace_required",
        "Select a workspace directory before writing files"
      )
    );
  });

  it("requires path and content in arguments", async () => {
    const missingPath = await writeFileHandler(
      { content: "hello" },
      { workspaceDir: "/tmp/project" }
    );
    expect(missingPath).toEqual(
      toolFailure(
        WRITE_FILE_TOOL_NAME,
        "invalid_arguments",
        "path is required and must be a non-empty string"
      )
    );

    const missingContent = await writeFileHandler(
      { path: "src/main.ts" },
      { workspaceDir: "/tmp/project" }
    );
    expect(missingContent).toEqual(
      toolFailure(
        WRITE_FILE_TOOL_NAME,
        "invalid_arguments",
        "content is required and must be a string"
      )
    );
  });

  it("returns structured tool failures from rejections", async () => {
    vi.mocked(invoke).mockRejectedValueOnce({
      code: "file_already_exists",
      message: "File already exists: /tmp/project/src/main.ts",
    });

    const result = await writeFileHandler(
      { path: "src/main.ts", content: "export {}\n" },
      { workspaceDir: "/tmp/project" }
    );

    expect(result).toEqual(
      toolFailure(
        WRITE_FILE_TOOL_NAME,
        "file_already_exists",
        "File already exists: /tmp/project/src/main.ts"
      )
    );
  });

  it("returns successful writes", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      path: "src/new.ts",
      action: "created",
      sha256: "abc123",
      bytesWritten: 18,
      linesAdded: 1,
      linesRemoved: 0,
    });

    const result = await writeFileHandler(
      { path: "src/new.ts", content: "export {}\n" },
      { workspaceDir: "/tmp/project" }
    );

    expect(result).toEqual(
      toolSuccess(WRITE_FILE_TOOL_NAME, {
        path: "src/new.ts",
        action: "created",
        sha256: "abc123",
        bytesWritten: 18,
        linesAdded: 1,
        linesRemoved: 0,
      })
    );
    expect(invoke).toHaveBeenCalledWith("tool_write_file", {
      workspaceDir: "/tmp/project",
      path: "src/new.ts",
      content: "export {}\n",
      createParentDirs: true,
    });
  });

  it("rejects non-tauri runtimes", async () => {
    vi.mocked(isTauri).mockReturnValueOnce(false);

    const result = await writeFileHandler(
      { path: "src/main.ts", content: "export {}\n" },
      { workspaceDir: "/tmp/project" }
    );

    expect(result).toEqual(
      toolFailure(
        WRITE_FILE_TOOL_NAME,
        "unsupported_runtime",
        "write_file is only available in the desktop app"
      )
    );
  });
});
