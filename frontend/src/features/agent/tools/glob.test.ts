import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
  apiPost: vi.fn(),
}));

import { apiPost } from "@/lib/api/client";
import { GLOB_TOOL_NAME } from "./definitions";
import { globHandler } from "./glob";
import { toolFailure, toolSuccess } from "./result";


describe("globHandler", () => {
  it("requires a workspace directory", async () => {
    const result = await globHandler(
      { glob_pattern: "**/*.ts" },
      { workspaceDir: null }
    );
    expect(result).toEqual(
      toolFailure(
        GLOB_TOOL_NAME,
        "workspace_required",
        "Select a workspace directory before searching files"
      )
    );
  });

  it("requires glob_pattern in arguments", async () => {
    const result = await globHandler({}, { workspaceDir: "/tmp/project" });
    expect(result).toEqual(
      toolFailure(
        GLOB_TOOL_NAME,
        "invalid_arguments",
        "glob_pattern is required and must be a non-empty string"
      )
    );
  });

  it("returns successful glob results", async () => {
    vi.mocked(apiPost).mockResolvedValueOnce({
      pattern: "**/*.ts",
      targetDirectory: "/tmp/project",
      matches: ["src/main.ts"],
      totalMatches: 1,
      truncated: false,
    });

    const result = await globHandler(
      { glob_pattern: "**/*.ts", target_directory: "src" },
      { workspaceDir: "/tmp/project" }
    );

    expect(result).toEqual(
      toolSuccess(GLOB_TOOL_NAME, {
        pattern: "**/*.ts",
        targetDirectory: "/tmp/project",
        matches: ["src/main.ts"],
        totalMatches: 1,
        truncated: false,
      })
    );
    expect(apiPost).toHaveBeenCalledWith("/api/tool_glob", {
      workspaceDir: "/tmp/project",
      globPattern: "**/*.ts",
      targetDirectory: "src",
      headLimit: undefined,
      respectGitignore: undefined,
    });
  });
});
