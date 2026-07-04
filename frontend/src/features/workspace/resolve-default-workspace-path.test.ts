import { describe, expect, it, vi } from "vitest";

import { resolveDefaultWorkspacePath } from "./resolve-default-workspace-path";
import { readWorkspaceDir } from "./storage";

vi.mock("./storage", () => ({
  readWorkspaceDir: vi.fn(),
}));

describe("resolveDefaultWorkspacePath", () => {
  it("returns the saved workspace path", async () => {
    vi.mocked(readWorkspaceDir).mockReturnValue("C:\\saved\\project");

    await expect(resolveDefaultWorkspacePath()).resolves.toBe("C:\\saved\\project");
  });

  it("returns empty string when nothing is saved", async () => {
    vi.mocked(readWorkspaceDir).mockReturnValue(null);

    await expect(resolveDefaultWorkspacePath()).resolves.toBe("");
  });
});
