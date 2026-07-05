import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/agent-todos", () => ({
  getAgentTodosBySession: vi.fn(async () => []),
}));

vi.mock("@/features/skills/lib/resolve-skills", () => ({
  resolveEnabledSkillsBySlugs: vi.fn(async () => ({ ok: true, skills: [] })),
}));

import { buildAgentMessages } from "@/features/agent/build-agent-messages";
import { getAgentTodosBySession } from "@/lib/db/agent-todos";
import { resolveEnabledSkillsBySlugs } from "@/features/skills/lib/resolve-skills";
import { normalizeEnvironment } from "@/features/agent/environment/normalize-environment";

const environment = normalizeEnvironment({
  workspaceDir: "/Users/apple/project",
  os: "macos aarch64 (15.5)",
  shell: "/bin/zsh",
  isGitRepository: true,
  today: "2026-06-02, Monday",
});

describe("buildAgentMessages", () => {
  beforeEach(() => {
    vi.mocked(getAgentTodosBySession).mockResolvedValue([]);
    vi.mocked(resolveEnabledSkillsBySlugs).mockResolvedValue({
      ok: true,
      skills: [],
    });
  });

  it("prepends a dynamic system message and drops empty history entries", async () => {
    const messages = await buildAgentMessages(
      [
        { role: "user", content: "你好" },
        { role: "assistant", content: "   " },
      ],
      environment
    );

    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toContain("workspaceDir: /Users/apple/project");
    expect(messages[0]?.content).toContain("gitRepository: yes");
    expect(messages[1]).toEqual({ role: "user", content: "你好" });
  });

  it("keeps user messages that only contain images", async () => {
    const messages = await buildAgentMessages(
      [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: "data:image/png;base64,abc" },
            },
          ],
        },
      ],
      environment
    );

    expect(messages).toHaveLength(2);
    expect(messages[1]?.role).toBe("user");
    expect(Array.isArray(messages[1]?.content)).toBe(true);
  });

  it("keeps assistant messages that only contain tool calls", async () => {
    const messages = await buildAgentMessages(
      [
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: {
                name: "list_dir",
                arguments: "{}",
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_1",
          name: "list_dir",
          content: "{}",
        },
      ],
      environment
    );

    expect(messages).toHaveLength(3);
    expect(messages[1]?.tool_calls).toHaveLength(1);
    expect(messages[2]?.role).toBe("tool");
  });

  it("keeps assistant messages that only contain reasoning content", async () => {
    const messages = await buildAgentMessages(
      [
        {
          role: "assistant",
          reasoning_content: "先分析一下问题",
        },
      ],
      environment
    );

    expect(messages).toHaveLength(2);
    expect(messages[1]?.reasoning_content).toBe("先分析一下问题");
  });

  it("keeps tool messages required by assistant tool_calls", async () => {
    const messages = await buildAgentMessages(
      [
        { role: "user", content: "帮我看看目录" },
        {
          role: "assistant",
          content: "我先看看目录。",
          reasoning_content: "需要先列一下项目结构。",
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: {
                name: "list_dir",
                arguments: '{"path":"."}',
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_1",
          name: "list_dir",
          content:
            '{"ok":true,"tool":"list_dir","data":{"path":".","entries":[]}}',
        },
      ],
      environment
    );

    expect(messages.filter((message) => message.role === "tool")).toHaveLength(1);
  });

  it("injects a persisted todo snapshot as an extra system message", async () => {
    vi.mocked(getAgentTodosBySession).mockResolvedValue([
      {
        id: "inspect-state",
        sessionId: "session-1",
        content: "Inspect current state",
        status: "completed",
        order: 0,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "implement-read",
        sessionId: "session-1",
        content: "Implement todo_read",
        status: "in_progress",
        order: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    const messages = await buildAgentMessages(
      [{ role: "user", content: "继续实现" }],
      environment,
      "agent",
      "session-1"
    );

    expect(messages).toHaveLength(3);
    expect(messages[1]).toEqual({
      role: "system",
      content: expect.stringContaining("## Current session todo state"),
    });
    expect(messages[1]?.content).not.toContain(
      "[completed] inspect-state: Inspect current state"
    );
    expect(messages[1]?.content).toContain("[in_progress] implement-read: Implement todo_read");
    expect(messages[1]?.content).toContain("Completed or cancelled todos are omitted");
  });

  it("injects a long-task session policy system message", async () => {
    const messages = await buildAgentMessages(
      [{ role: "user", content: "继续实现" }],
      environment,
      "agent",
      "session-1",
      {
        sessionKind: "long_task",
        autonomyMode: "unattended",
        decisionPolicyVersion: "mvp-v1",
        decisionModel: "decision-model",
      }
    );

    expect(messages[1]).toEqual({
      role: "system",
      content: expect.stringContaining("## Session execution policy"),
    });
    expect(messages[1]?.content).toContain("sessionKind: long_task");
    expect(messages[1]?.content).toContain("decisionModel: decision-model");
  });

  it("omits the snapshot when only terminal todos exist", async () => {
    vi.mocked(getAgentTodosBySession).mockResolvedValue([
      {
        id: "done-task",
        sessionId: "session-1",
        content: "Already done",
        status: "completed",
        order: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    const messages = await buildAgentMessages(
      [{ role: "user", content: "继续实现" }],
      environment,
      "agent",
      "session-1"
    );

    expect(messages).toHaveLength(2);
  });

  it("truncates long active todo snapshots and hints to use todo_read", async () => {
    vi.mocked(getAgentTodosBySession).mockResolvedValue(
      Array.from({ length: 10 }, (_, index) => ({
        id: `task-${index + 1}`,
        sessionId: "session-1",
        content: `Task ${index + 1}`,
        status: "pending" as const,
        order: index,
        createdAt: 1,
        updatedAt: 1,
      }))
    );

    const messages = await buildAgentMessages(
      [{ role: "user", content: "继续实现" }],
      environment,
      "agent",
      "session-1"
    );

    expect(messages[1]?.content).toContain("[pending] task-1: Task 1");
    expect(messages[1]?.content).toContain("[pending] task-8: Task 8");
    expect(messages[1]?.content).not.toContain("[pending] task-9: Task 9");
    expect(messages[1]?.content).toContain("2 more active todos omitted");
  });

  it("injects only explicit referencedSkills, not plain-text /slug tokens", async () => {
    vi.mocked(resolveEnabledSkillsBySlugs).mockImplementation(async (slugs) => {
      expect(slugs).toEqual(["review"]);
      return {
        ok: true,
        skills: [
          {
            id: "skill-review",
            slug: "review",
            name: "Review",
            description: "Review code",
            content: "Review checklist",
            source: "user",
          },
        ],
      };
    });

    const messages = await buildAgentMessages(
      [
        {
          role: "user",
          content: "please /debug this",
          referencedSkills: ["review"],
        },
      ],
      environment
    );

    const userMessage = messages.find((message) => message.role === "user");
    expect(typeof userMessage?.content).toBe("string");
    expect(userMessage?.content).toContain("Referenced skill: review");
    expect(userMessage?.content).not.toContain("Referenced skill: debug");
  });
});
