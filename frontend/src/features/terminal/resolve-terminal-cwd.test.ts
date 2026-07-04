import { describe, expect, it, vi } from "vitest";

import { apiGet } from "@/lib/api/client";

import { resolveHomeDirectory, resolveTerminalCwd } from "./resolve-terminal-cwd";

vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(),
}));

describe("resolveTerminalCwd", () => {
  it("prefers the bound workspace directory", async () => {
    await expect(resolveTerminalCwd(" /tmp/project ")).resolves.toBe("/tmp/project");
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("falls back to the server workspace when none is bound", async () => {
    vi.mocked(apiGet).mockResolvedValue({ workspaceDir: "/srv/coder" });

    await expect(resolveTerminalCwd(null)).resolves.toBe("/srv/coder");
    expect(apiGet).toHaveBeenCalledWith("/api/server_info");
  });
});

describe("resolveHomeDirectory", () => {
  it("returns null when server info is unavailable", async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error("offline"));

    await expect(resolveHomeDirectory()).resolves.toBeNull();
  });
});
