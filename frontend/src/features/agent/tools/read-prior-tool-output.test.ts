import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getSession: vi.fn(),
}));

vi.mock("../handoff-workspace", () => ({
  readToolArchiveIndex: vi.fn(),
  readWorkspaceTextFile: vi.fn(),
  buildToolArchiveFilePath: vi.fn(() => ".agent/archive.json"),
}));

import { getSession } from "@/lib/db";
import {
  readToolArchiveIndex,
  readWorkspaceTextFile,
} from "../handoff-workspace";
import { readPriorToolOutputHandler } from "./read-prior-tool-output";

describe("readPriorToolOutputHandler", () => {
  beforeEach(() => {
    vi.mocked(getSession).mockReset();
    vi.mocked(readToolArchiveIndex).mockReset();
    vi.mocked(readWorkspaceTextFile).mockReset();
  });

  it("returns the latest matching archived output", async () => {
    vi.mocked(getSession).mockResolvedValue({
      id: "session-1",
      title: "Chat",
      model: "gpt-test",
      provider: "custom",
      workspaceDir: "/workspace",
      sessionKind: "standard",
      autonomyMode: "interactive",
      decisionPolicyVersion: "mvp-v1",
      createdAt: 1,
      updatedAt: 1,
    });
    vi.mocked(readToolArchiveIndex).mockResolvedValue({
      sessionId: "session-1",
      generatedAt: "2026-07-08T10:00:00.000Z",
      entries: [
        {
          sessionId: "session-1",
          messageId: "msg-1",
          invocationId: "call-1",
          toolName: "read_file",
          createdAt: 10,
          archivePath: ".agent/archive.json",
          outputPath: null,
          relativeTargetPath: "src/handoff.ts",
          queryPattern: null,
        },
      ],
    });
    vi.mocked(readWorkspaceTextFile).mockResolvedValue({
      path: ".agent/archive.json",
      sha256: "abc",
      content: '{"ok":true}',
    });

    const result = await readPriorToolOutputHandler(
      { session_id: "session-1", tool_name: "read_file", path_pattern: "handoff" },
      { workspaceDir: "/workspace" }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.archivePath).toBe(".agent/archive.json");
      expect(result.data.content).toContain('"ok":true');
    }
  });

  it("extracts embedded output from archive wrapper JSON", async () => {
    vi.mocked(getSession).mockResolvedValue({
      id: "session-1",
      title: "Chat",
      model: "gpt-test",
      provider: "custom",
      workspaceDir: "/workspace",
      sessionKind: "standard",
      autonomyMode: "interactive",
      decisionPolicyVersion: "mvp-v1",
      createdAt: 1,
      updatedAt: 1,
    });
    vi.mocked(readToolArchiveIndex).mockResolvedValue({
      sessionId: "session-1",
      generatedAt: "2026-07-08T10:00:00.000Z",
      entries: [
        {
          sessionId: "session-1",
          messageId: "msg-1",
          invocationId: "call-1",
          toolName: "grep",
          createdAt: 10,
          archivePath: ".agent/archive.json",
          outputPath: null,
          relativeTargetPath: "src/handoff.ts",
          queryPattern: "handoff",
        },
      ],
    });
    vi.mocked(readWorkspaceTextFile).mockResolvedValue({
      path: ".agent/archive.json",
      sha256: "abc",
      content: JSON.stringify({
        toolName: "grep",
        output: { ok: true, data: { matches: 3 } },
        summary: "3 matches",
      }),
    });

    const result = await readPriorToolOutputHandler(
      { session_id: "session-1", tool_name: "grep" },
      { workspaceDir: "/workspace" }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.content).toContain('"matches": 3');
      expect(result.data.content).not.toContain('"summary"');
    }
  });

  it("fails when no archive exists", async () => {
    vi.mocked(getSession).mockResolvedValue({
      id: "session-1",
      title: "Chat",
      model: "gpt-test",
      provider: "custom",
      workspaceDir: "/workspace",
      sessionKind: "standard",
      autonomyMode: "interactive",
      decisionPolicyVersion: "mvp-v1",
      createdAt: 1,
      updatedAt: 1,
    });
    vi.mocked(readToolArchiveIndex).mockResolvedValue(null);

    const result = await readPriorToolOutputHandler(
      { session_id: "session-1" },
      { workspaceDir: "/workspace" }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("not_found");
    }
  });
});
