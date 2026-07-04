import { describe, expect, it, vi } from "vitest";

import { apiPost } from "@/lib/api/client";

import { searchWorkspacePaths } from "./search-workspace-paths";

vi.mock("@/lib/api/client", () => ({
  apiPost: vi.fn(),
}));

describe("searchWorkspacePaths", () => {
  it("forwards the workspace directory to the backend", async () => {
    vi.mocked(apiPost).mockResolvedValue({
      query: "src",
      matches: [],
      totalMatches: 0,
      truncated: false,
    });

    await searchWorkspacePaths("/tmp/project", "src", {
      headLimit: 20,
      respectGitignore: true,
    });

    expect(apiPost).toHaveBeenCalledWith("/api/search_workspace_paths", {
      workspaceDir: "/tmp/project",
      query: "src",
      headLimit: 20,
      respectGitignore: true,
    });
  });
});
