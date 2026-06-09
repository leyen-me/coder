import { describe, expect, it, vi } from "vitest";

import { GLOB_TOOL_NAME } from "./definitions";
import { globHandler } from "./glob";
import { toolFailure, toolSuccess } from "./result";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => true),
  invoke: vi.fn(),
}));

import { invoke, isTauri } from "@tauri-apps/api/core";

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
    vi.mocked(invoke).mockResolvedValueOnce({
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
    expect(invoke).toHaveBeenCalledWith("tool_glob", {
      workspaceDir: "/tmp/project",
      globPattern: "**/*.ts",
      targetDirectory: "src",
      headLimit: undefined,
      respectGitignore: undefined,
    });
  });

  it("returns unsupported runtime outside tauri", async () => {
    vi.mocked(isTauri).mockReturnValueOnce(false);

    const result = await globHandler(
      { glob_pattern: "**/*.ts" },
      { workspaceDir: "/tmp/project" }
    );

    expect(result).toEqual(
      toolFailure(
        GLOB_TOOL_NAME,
        "unsupported_runtime",
        "glob is only available in the desktop app"
      )
    );
  });
});
