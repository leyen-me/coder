import { describe, expect, it, vi } from "vitest";

import { KILL_SHELL_TOOL_NAME } from "./definitions";
import { killShellHandler } from "./kill-shell";
import { toolFailure, toolSuccess } from "./result";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => true),
  invoke: vi.fn(),
}));

import { invoke, isTauri } from "@tauri-apps/api/core";

describe("killShellHandler", () => {
  it("returns unsupported runtime outside tauri", async () => {
    vi.mocked(isTauri).mockReturnValueOnce(false);

    const result = await killShellHandler(
      { shell_id: "shell-1" },
      { workspaceDir: null }
    );

    expect(result).toEqual(
      toolFailure(
        KILL_SHELL_TOOL_NAME,
        "unsupported_runtime",
        "kill_shell is only available in the desktop app"
      )
    );
  });

  it("requires shell_id in arguments", async () => {
    const result = await killShellHandler({}, { workspaceDir: "/tmp/project" });

    expect(result).toEqual(
      toolFailure(
        KILL_SHELL_TOOL_NAME,
        "invalid_arguments",
        "shell_id is required and must be a non-empty string"
      )
    );
  });

  it("kills a shell by id", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    const result = await killShellHandler(
      { shell_id: "shell-42" },
      { workspaceDir: "/tmp/project" }
    );

    expect(result).toEqual(
      toolSuccess(KILL_SHELL_TOOL_NAME, {
        shellId: "shell-42",
        killed: true,
      })
    );
    expect(invoke).toHaveBeenCalledWith("shell_kill", { shellId: "shell-42" });
  });

  it("returns execution failures from invoke", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("Unknown shell_id"));

    const result = await killShellHandler(
      { shell_id: "missing" },
      { workspaceDir: "/tmp/project" }
    );

    expect(result).toEqual(
      toolFailure(
        KILL_SHELL_TOOL_NAME,
        "execution_failed",
        "Unknown shell_id"
      )
    );
  });
});
