import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
  apiPost: vi.fn(),
}));

import { apiPost } from "@/lib/api/client";
import { READ_FILE_TOOL_NAME } from "./definitions";
import { readFileHandler } from "./read-file";
import { toolFailure, toolSuccess } from "./result";


describe("readFileHandler", () => {
  it("requires a workspace directory", async () => {
    const result = await readFileHandler({ path: "src/main.ts" }, { workspaceDir: null });
    expect(result).toEqual(
      toolFailure(
        READ_FILE_TOOL_NAME,
        "workspace_required",
        "Select a workspace directory before reading files"
      )
    );
  });

  it("requires path in arguments", async () => {
    const result = await readFileHandler({}, { workspaceDir: "/tmp/project" });
    expect(result).toEqual(
      toolFailure(
        READ_FILE_TOOL_NAME,
        "invalid_arguments",
        "path is required and must be a non-empty string"
      )
    );
  });

  it("returns structured tool failures from JSON string rejections", async () => {
    vi.mocked(apiPost).mockRejectedValueOnce(
      JSON.stringify({
        code: "binary_file",
        message: "Binary file detected (image/png)",
        mimeType: "image/png",
      })
    );

    const result = await readFileHandler(
      { path: "assets/logo.png" },
      { workspaceDir: "/tmp/project" }
    );

    expect(result).toEqual(
      toolFailure(
        READ_FILE_TOOL_NAME,
        "binary_file",
        "Binary file detected (image/png)"
      )
    );
  });

  it("returns structured tool failures from object rejections", async () => {
    vi.mocked(apiPost).mockRejectedValueOnce({
      code: "path_not_found",
      message: "Path not found: /tmp/project/missing.ts",
    });

    const result = await readFileHandler(
      { path: "missing.ts" },
      { workspaceDir: "/tmp/project" }
    );

    expect(result).toEqual(
      toolFailure(
        READ_FILE_TOOL_NAME,
        "path_not_found",
        "Path not found: /tmp/project/missing.ts"
      )
    );
  });

  it("returns successful reads with numbered content", async () => {
    vi.mocked(apiPost).mockResolvedValueOnce({
      path: "src/main.ts",
      encoding: "utf-8",
      mimeType: "text/typescript",
      sha256: "abc123",
      totalLines: 2,
      startLine: 1,
      endLine: 2,
      truncated: false,
      containsSecrets: false,
      content: "1 | export {}\n2 | \n",
    });

    const result = await readFileHandler(
      { path: "src/main.ts", start_line: 1, max_lines: 500 },
      { workspaceDir: "/tmp/project" }
    );

    expect(result).toEqual(
      toolSuccess(READ_FILE_TOOL_NAME, {
        path: "src/main.ts",
        encoding: "utf-8",
        mimeType: "text/typescript",
        sha256: "abc123",
        totalLines: 2,
        startLine: 1,
        endLine: 2,
        truncated: false,
        containsSecrets: false,
        content: "1 | export {}\n2 | \n",
      })
    );
    expect(apiPost).toHaveBeenCalledWith("/api/tool_read_file", {
      workspaceDir: "/tmp/project",
      path: "src/main.ts",
      startLine: 1,
      maxLines: 500,
      respectGitignore: true,
    });
  });
});
