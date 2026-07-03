import { describe, expect, it } from "vitest";

import { buildSystemPrompt } from "@/features/agent/environment/build-system-prompt";
import { normalizeEnvironment } from "@/features/agent/environment/build-system-prompt";
import {
  serializeToolResult,
  toolFailure,
  toolSuccess,
} from "@/features/agent/tools/result";

describe("buildSystemPrompt", () => {
  it("includes runtime metadata without inline tool or git sections", () => {
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
    expect(prompt).not.toContain("## Tools Rules");
    expect(prompt).not.toContain("## Git");
  });

  it("includes enabled system skills such as tools guidance", () => {
    const prompt = buildSystemPrompt(
      normalizeEnvironment({
        workspaceDir: "/tmp/project",
        os: "macos aarch64 (15.5)",
        shell: "/bin/zsh",
        isGitRepository: true,
        today: "2026-06-09, Tuesday",
        enabledSystemSkills: [
          {
            slug: "tools",
            name: "Tools Rules",
            content: "Use glob to find files by name pattern.",
          },
        ],
      })
    );

    expect(prompt).toContain("## Tools Rules");
    expect(prompt).not.toContain("## Active skills (system)");
    expect(prompt).toContain("Use glob to find files by name pattern.");
    expect(prompt).not.toContain("## Git");
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

  it("includes ask mode guidance when agentMode is ask", () => {
    const prompt = buildSystemPrompt(
      normalizeEnvironment({
        workspaceDir: "/tmp/project",
        os: "macos aarch64 (15.5)",
        shell: "/bin/zsh",
        isGitRepository: false,
        today: "2026-06-02, Monday",
      }),
      "ask"
    );

    expect(prompt).toContain("mode: ask");
    expect(prompt).toContain("You are in Ask mode");
  });

  it("includes plan mode guidance when agentMode is plan", () => {
    const prompt = buildSystemPrompt(
      normalizeEnvironment({
        workspaceDir: "/tmp/project",
        os: "macos aarch64 (15.5)",
        shell: "/bin/zsh",
        isGitRepository: false,
        today: "2026-06-02, Monday",
      }),
      "plan"
    );

    expect(prompt).toContain("mode: plan");
    expect(prompt).toContain("You are in Plan mode");
    expect(prompt).toContain("plan_update");
    expect(prompt).toContain("ask_question");
    expect(prompt).toContain("Plan tab");
    expect(prompt).toContain("Build");
  });

  it("warns when workspace is not selected in plan mode", () => {
    const prompt = buildSystemPrompt(
      normalizeEnvironment({
        workspaceDir: null,
        os: "macos aarch64 (15.5)",
        shell: "/bin/zsh",
        isGitRepository: false,
        today: "2026-06-02, Monday",
      }),
      "plan"
    );

    expect(prompt).toContain("Workspace required");
  });

  it("builds prompt on Windows without Windows-specific guidance", () => {
    const prompt = buildSystemPrompt(
      normalizeEnvironment({
        workspaceDir: "C:\\project",
        os: "windows x86_64 (windows)",
        shell: "powershell",
        isGitRepository: true,
        today: "2026-06-13, Saturday",
      })
    );

    expect(prompt).toContain("## Environment");
    expect(prompt).toContain("## Communication Rules");
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
