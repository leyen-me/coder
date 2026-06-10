import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => true),
  invoke: vi.fn(),
}));

vi.mock("@/features/skills/lib/resolve-skills", () => ({
  getEnabledSystemSkills: vi.fn(async () => []),
}));

import { invoke, isTauri } from "@tauri-apps/api/core";

import { resolveAgentEnvironment } from "./resolve-environment";

describe("resolveAgentEnvironment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isTauri).mockReturnValue(true);
  });

  it("maps agentsMd from the runtime environment response", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      os: "macos aarch64 (15.5)",
      shell: "/bin/zsh",
      isGitRepository: true,
      agentsMd: {
        path: "AGENTS.md",
        content: "## Rules\nBe careful.",
        truncated: false,
      },
    });

    const environment = await resolveAgentEnvironment("/tmp/project");

    expect(invoke).toHaveBeenCalledWith("agent_get_runtime_environment", {
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
    vi.mocked(invoke).mockResolvedValueOnce({
      os: "macos aarch64 (15.5)",
      shell: "/bin/zsh",
      isGitRepository: false,
    });

    const environment = await resolveAgentEnvironment("/tmp/project");

    expect(environment.agentsMd).toBeNull();
  });

  it("falls back without agentsMd outside Tauri", async () => {
    vi.mocked(isTauri).mockReturnValueOnce(false);

    const environment = await resolveAgentEnvironment("/tmp/project");

    expect(invoke).not.toHaveBeenCalled();
    expect(environment.agentsMd).toBeNull();
    expect(environment.shell).toBe("unavailable in browser preview");
  });
});
