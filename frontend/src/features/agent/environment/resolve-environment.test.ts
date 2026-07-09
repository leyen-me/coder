import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
  apiPost: vi.fn(),
}));

vi.mock("@/features/skills/lib/resolve-skills", () => ({
  getSystemModules: vi.fn(() => []),
}));

vi.mock("@/lib/db/remote-targets", () => ({
  listRemoteTargets: vi.fn(async () => []),
}));

import { apiPost } from "@/lib/api/client";
import { resolveAgentEnvironment } from "./resolve-environment";

describe("resolveAgentEnvironment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps agentsMd from the runtime environment response", async () => {
    vi.mocked(apiPost).mockResolvedValueOnce({
      os: "macos aarch64 (15.5)",
      shell: "/bin/zsh",
      isGitRepository: true,
      agentsMd: {
        path: "AGENTS.md",
        content: "## Rules\nBe careful.",
        truncated: false,
      },
      skillRoots: {
        user: "/Users/test/.coder/skills",
        workspace: "/tmp/project/.coder/skills",
      },
      availableSkills: [],
    });

    const environment = await resolveAgentEnvironment("/tmp/project");

    expect(apiPost).toHaveBeenCalledWith("/api/runtime_environment", {
      workspaceDir: "/tmp/project",
    });
    expect(environment.agentsMd).toEqual({
      path: "AGENTS.md",
      content: "## Rules\nBe careful.",
      truncated: false,
    });
    expect(environment.isGitRepository).toBe(true);
  });

  it("defaults agentsMd to null when omitted from the response", async () => {
    vi.mocked(apiPost).mockResolvedValueOnce({
      os: "macos aarch64 (15.5)",
      shell: "/bin/zsh",
      isGitRepository: false,
      skillRoots: {
        user: "/Users/test/.coder/skills",
        workspace: "/tmp/project/.coder/skills",
      },
      availableSkills: [],
    });

    const environment = await resolveAgentEnvironment("/tmp/project");

    expect(environment.agentsMd).toBeNull();
  });

  it("falls back to browser defaults when runtime resolution fails", async () => {
    vi.mocked(apiPost).mockRejectedValueOnce(new Error("runtime unavailable"));

    const environment = await resolveAgentEnvironment("/tmp/project");

    expect(environment.agentsMd).toBeNull();
    expect(environment.shell).toBe("unavailable in browser preview");
    expect(environment.availableSkills).toEqual([]);
  });
});
