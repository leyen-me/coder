import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
  apiPost: vi.fn(),
}));

import { apiPost } from "@/lib/api/client";
import { KILL_SHELL_TOOL_NAME } from "./definitions";
import { killShellHandler } from "./kill-shell";
import { toolFailure, toolSuccess } from "./result";


describe("killShellHandler", () => {
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
    vi.mocked(apiPost).mockResolvedValueOnce(undefined);

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
    expect(apiPost).toHaveBeenCalledWith("/api/shell_kill", {
      shellId: "shell-42",
    });
  });

  it("returns execution failures from apiPost", async () => {
    vi.mocked(apiPost).mockRejectedValueOnce(new Error("Unknown shell_id"));

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
