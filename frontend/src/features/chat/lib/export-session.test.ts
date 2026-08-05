import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    getSession: vi.fn(),
    getMessagesBySession: vi.fn(),
    getAgentTodosBySession: vi.fn(),
    getDb: vi.fn(),
  };
});

import {
  getAgentTodosBySession,
  getDb,
  getMessagesBySession,
  getSession,
} from "@/lib/db";
import {
  SESSION_EXPORT_FORMAT,
  SESSION_EXPORT_VERSION,
  buildSessionExport,
  exportSessionAsJson,
  exportSessionAsMarkdown,
  sanitizeFilename,
} from "./export-session";

const session = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  title: "Root chat",
  model: "test-model",
  provider: "custom",
  workspaceDir: "/workspace",
  sessionKind: "standard" as const,
  autonomyMode: "interactive" as const,
  decisionPolicyVersion: "mvp-v1",
  parentSessionId: null,
  createdAt: 100,
  updatedAt: 200,
  ...overrides,
});

const message = (id: string, sessionId: string) => ({
  id,
  sessionId,
  role: "assistant" as const,
  content: "answer",
  thinking: "step by step",
  toolInvocations: [
    {
      id: "tool-1",
      name: "read_file",
      input: { path: "/workspace/a.ts" },
      output: { content: "file body" },
      errorText: undefined,
      state: "output-available" as const,
    },
  ],
  processSteps: [
    { id: "step-1", kind: "tool" as const, toolCallId: "tool-1" },
  ],
  status: "completed" as const,
  taskId: "task-1",
  error: null,
  usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  durationMs: 1200,
  createdAt: 100,
});

const todo = (id: string, sessionId: string) => ({
  id,
  sessionId,
  content: "Do the thing",
  status: "in_progress" as const,
  order: 0,
  createdAt: 100,
  updatedAt: 150,
});

describe("sanitizeFilename", () => {
  it("removes OS-invalid filename characters and collapses whitespace", () => {
    expect(sanitizeFilename("  My  chat/with:bad…chars  ")).toBe(
      "My chatwithbadchars"
    );
  });

  it("returns empty string for an empty input", () => {
    expect(sanitizeFilename("   ")).toBe("");
  });
});

describe("buildSessionExport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("collects the full session tree with raw message fidelity", async () => {
    vi.mocked(getSession).mockImplementation(async (id: string) => {
      if (id === "s1") return session("s1");
      if (id === "s2") return session("s2", { title: "Sub-agent", parentSessionId: "s1" });
      return null;
    });
    vi.mocked(getMessagesBySession).mockImplementation(async (id: string) =>
      id === "s1" ? [message("m1", "s1")] : [message("m2", "s2")]
    );
    vi.mocked(getAgentTodosBySession).mockResolvedValue([todo("t1", "s1")]);
    vi.mocked(getDb).mockResolvedValue({
      getAll: vi.fn().mockResolvedValue([session("s2", { title: "Sub-agent", parentSessionId: "s1" })]),
    } as never);

    const entry = await buildSessionExport("s1");
    expect(entry).not.toBeNull();
    expect(entry!.session.id).toBe("s1");
    expect(entry!.messages).toHaveLength(1);
    expect(entry!.todos).toHaveLength(1);

    // Tool inputs/outputs, errors, usage and process steps survive untouched.
    const tool = entry!.messages[0].toolInvocations[0];
    expect(tool.input).toEqual({ path: "/workspace/a.ts" });
    expect(tool.output).toEqual({ content: "file body" });
    expect(entry!.messages[0].usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
    expect(entry!.messages[0].processSteps).toHaveLength(1);

    // Sub-agent sessions are recursively included.
    expect(entry!.subSessions).toHaveLength(1);
    expect(entry!.subSessions[0].session.id).toBe("s2");
    expect(entry!.subSessions[0].messages[0].id).toBe("m2");
  });

  it("returns null for a missing session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(buildSessionExport("missing")).resolves.toBeNull();
  });

  it("guards against session graph cycles", async () => {
    vi.mocked(getSession).mockImplementation(async (id: string) => {
      if (id === "s1") return session("s1");
      if (id === "s2") return session("s2", { parentSessionId: "s1" });
      return null;
    });
    vi.mocked(getMessagesBySession).mockResolvedValue([]);
    vi.mocked(getAgentTodosBySession).mockResolvedValue([]);
    // s1's child list contains s2, whose child list points back at s1,
    // forming a cycle.
    vi.mocked(getDb).mockResolvedValue({
      getAll: vi.fn().mockResolvedValue([
        session("s2", { parentSessionId: "s1" }),
        session("s1", { parentSessionId: "s2" }),
      ]),
    } as never);

    const entry = await buildSessionExport("s1");
    expect(entry).not.toBeNull();
    expect(entry!.subSessions[0].session.id).toBe("s2");
    expect(entry!.subSessions[0].subSessions).toEqual([]);
  });
});

describe("exportSessionAsJson", () => {
  let click: ReturnType<typeof vi.fn>;
  let anchor: { click: typeof click; download: string; href: string };
  let createdBlobs: { parts: unknown[]; opts: unknown }[];

  beforeEach(() => {
    click = vi.fn();
    anchor = { click, download: "", href: "" };
    createdBlobs = [];
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:export"),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal("Blob", class {
      parts: unknown[];
      opts: unknown;
      constructor(parts: unknown[], opts: unknown) {
        this.parts = parts;
        this.opts = opts;
        createdBlobs.push(this);
      }
    });
    vi.stubGlobal("document", {
      createElement: vi.fn(() => anchor),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("downloads a single uncompressed pretty-printed JSON file with everything", async () => {
    vi.mocked(getSession).mockImplementation(async (id: string) => {
      if (id === "s1") return session("s1");
      if (id === "s2") return session("s2", { title: "Sub", parentSessionId: "s1" });
      return null;
    });
    vi.mocked(getMessagesBySession).mockImplementation(async (id: string) =>
      id === "s1" ? [message("m1", "s1")] : []
    );
    vi.mocked(getAgentTodosBySession).mockResolvedValue([]);
    vi.mocked(getDb).mockResolvedValue({
      getAll: vi.fn().mockResolvedValue([session("s2", { title: "Sub", parentSessionId: "s1" })]),
    } as never);

    const ok = await exportSessionAsJson("s1");
    expect(ok).toBe(true);

    const raw = createdBlobs[0].parts[0] as string;
    const parsed = JSON.parse(raw);

    expect(parsed.format).toBe(SESSION_EXPORT_FORMAT);
    expect(parsed.version).toBe(SESSION_EXPORT_VERSION);
    expect(parsed.session.id).toBe("s1");
    expect(parsed.messages[0].toolInvocations[0].output).toEqual({
      content: "file body",
    });
    expect(parsed.subSessions[0].session.id).toBe("s2");

    // Uncompressed, human-readable JSON (2-space indent).
    expect(raw.startsWith(`{\n  "format": "coder-session-export"`)).toBe(true);
    expect(anchor.download).toBe("Root chat.json");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("returns false when the session does not exist", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(exportSessionAsJson("missing")).resolves.toBe(false);
  });
});

describe("exportSessionAsMarkdown", () => {
  let click: ReturnType<typeof vi.fn>;
  let anchor: { click: typeof click; download: string; href: string };
  let createdBlobs: { parts: unknown[]; opts: unknown }[];

  beforeEach(() => {
    click = vi.fn();
    anchor = { click, download: "", href: "" };
    createdBlobs = [];
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:export"),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal("Blob", class {
      parts: unknown[];
      opts: unknown;
      constructor(parts: unknown[], opts: unknown) {
        this.parts = parts;
        this.opts = opts;
        createdBlobs.push(this);
      }
    });
    vi.stubGlobal("document", {
      createElement: vi.fn(() => anchor),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes a readable summary with metadata, thinking, and tool calls", async () => {
    vi.mocked(getSession).mockResolvedValue(
      session("s1", { title: "My Chat", createdAt: 1_700_000_000_000 })
    );
    vi.mocked(getMessagesBySession).mockResolvedValue([
      {
        ...message("m1", "s1"),
        role: "user",
        content: "Hello",
        thinking: "",
        toolInvocations: [],
      },
      message("m1", "s1"),
    ]);
    vi.mocked(getAgentTodosBySession).mockResolvedValue([]);
    vi.mocked(getDb).mockResolvedValue({
      getAll: vi.fn().mockResolvedValue([]),
    } as never);

    const ok = await exportSessionAsMarkdown("s1");
    expect(ok).toBe(true);

    const markdown = createdBlobs[0].parts[0] as string;
    expect(markdown).toContain("# My Chat");
    expect(markdown).toContain("- **Model**: test-model");
    expect(markdown).toContain("- **Messages**: 2");
    expect(markdown).toContain("- **Workspace**: `/workspace`");
    expect(markdown).toContain("## User");
    expect(markdown).toContain("Hello");
    expect(markdown).toContain("## Assistant");
    expect(markdown).toContain("answer");
    expect(markdown).toContain("> **Thinking**");
    expect(markdown).toContain("> step by step");
    expect(markdown).toContain("### Tool Calls");
    expect(markdown).toContain("- `read_file` (output-available)");

    expect(anchor.download).toBe("My Chat.md");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("returns false when the session does not exist", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(exportSessionAsMarkdown("missing")).resolves.toBe(false);
  });
});
