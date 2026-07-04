import { describe, expect, it, vi } from "vitest";

import { resolveDefaultWorkspacePath } from "./resolve-default-workspace-path";
import { readWorkspaceDir } from "./storage";

vi.mock("./storage", () => ({
  readWorkspaceDir: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(),
}));

describe("resolveDefaultWorkspacePath", () => {
  it("prefers the saved workspace path", async () => {
    vi.mocked(readWorkspaceDir).mockReturnValue("C:\\saved\\project");
    const { apiGet } = await import("@/lib/api/client");

    await expect(resolveDefaultWorkspacePath()).resolves.toBe("C:\\saved\\project");
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("falls back to server info when nothing is saved", async () => {
    vi.mocked(readWorkspaceDir).mockReturnValue(null);
    const { apiGet } = await import("@/lib/api/client");
    vi.mocked(apiGet).mockResolvedValue({ workspaceDir: "C:\\startup\\project" });

    await expect(resolveDefaultWorkspacePath()).resolves.toBe("C:\\startup\\project");
  });
});
