import { describe, expect, it } from "vitest";

import { buildSystemPrompt } from "@/features/agent/environment/build-system-prompt";
import { normalizeEnvironment } from "@/features/agent/environment/build-system-prompt";
import {
  serializeToolResult,
  toolFailure,
  toolSuccess,
} from "@/features/agent/tools/result";

describe("buildSystemPrompt", () => {
  it("includes runtime metadata and tool guidance", () => {
    const prompt = buildSystemPrompt(
      normalizeEnvironment({
        workspaceDir: "/tmp/project",
        os: "macos aarch64 (15.5)",
        shell: "/bin/zsh",
        isGitRepository: false,
        today: "2026-06-02, Monday",
      })
    );

    expect(prompt).toContain("workspaceDir: /tmp/project");
    expect(prompt).toContain("shell: /bin/zsh");
    expect(prompt).toContain("gitRepository: no");
    expect(prompt).toContain("## Tools");
    expect(prompt).not.toContain("## Git");
  });

  it("includes git commit rules in git repositories", () => {
    const prompt = buildSystemPrompt(
      normalizeEnvironment({
        workspaceDir: "C:\\Users\\dev\\project",
        os: "windows x86_64 (10.0)",
        shell: "powershell",
        isGitRepository: true,
        today: "2026-06-09, Tuesday",
      })
    );

    expect(prompt).toContain("## Git");
    expect(prompt).toContain("git status");
    expect(prompt).toContain("wait for confirmation");
    expect(prompt).toContain("### Windows shell");
    expect(prompt).toContain("git commit -F");
  });

  it("includes project instructions when agentsMd is present", () => {
    const prompt = buildSystemPrompt(
      normalizeEnvironment({
        workspaceDir: "/tmp/project",
        os: "macos aarch64 (15.5)",
        shell: "/bin/zsh",
        isGitRepository: false,
        today: "2026-06-02, Monday",
        agentsMd: {
          path: "AGENTS.md",
          content: "## Style\nUse TypeScript strict mode.",
          truncated: false,
        },
      })
    );

    expect(prompt).toContain("## Project instructions (AGENTS.md)");
    expect(prompt).toContain("Use TypeScript strict mode.");
    expect(prompt).not.toContain("truncated to 32 KB");
  });

  it("notes truncation when agentsMd was truncated", () => {
    const prompt = buildSystemPrompt(
      normalizeEnvironment({
        workspaceDir: "/tmp/project",
        os: "macos aarch64 (15.5)",
        shell: "/bin/zsh",
        isGitRepository: false,
        today: "2026-06-02, Monday",
        agentsMd: {
          path: "AGENTS.md",
          content: "partial content",
          truncated: true,
        },
      })
    );

    expect(prompt).toContain("truncated to 32 KB");
    expect(prompt).toContain("read_file on AGENTS.md");
  });

  it("omits project instructions when agentsMd is absent", () => {
    const prompt = buildSystemPrompt(
      normalizeEnvironment({
        workspaceDir: "/tmp/project",
        os: "macos aarch64 (15.5)",
        shell: "/bin/zsh",
        isGitRepository: false,
        today: "2026-06-02, Monday",
        agentsMd: null,
      })
    );

    expect(prompt).not.toContain("## Project instructions (AGENTS.md)");
  });
});

describe("tool result envelope", () => {
  it("serializes success and failure in a unified shape", () => {
    expect(
      JSON.parse(
        serializeToolResult(
          toolSuccess("list_dir", {
            path: ".",
            entries: [],
          })
        )
      )
    ).toEqual({
      ok: true,
      tool: "list_dir",
      data: { path: ".", entries: [] },
    });

    expect(
      JSON.parse(
        serializeToolResult(
          toolFailure("list_dir", "workspace_required", "Select a workspace")
        )
      )
    ).toEqual({
      ok: false,
      tool: "list_dir",
      error: {
        code: "workspace_required",
        message: "Select a workspace",
      },
    });
  });
});
