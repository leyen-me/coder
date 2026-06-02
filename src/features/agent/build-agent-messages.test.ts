import { describe, expect, it } from "vitest";

import { buildAgentMessages } from "@/features/agent/build-agent-messages";
import { normalizeEnvironment } from "@/features/agent/environment/build-system-prompt";

const environment = normalizeEnvironment({
  workspaceDir: "/Users/apple/project",
  os: "macos aarch64 (15.5)",
  shell: "/bin/zsh",
  isGitRepository: true,
  today: "2026-06-02, Monday",
});

describe("buildAgentMessages", () => {
  it("prepends a dynamic system message and drops empty history entries", () => {
    const messages = buildAgentMessages(
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

  it("keeps user messages that only contain images", () => {
    const messages = buildAgentMessages(
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

  it("keeps assistant messages that only contain tool calls", () => {
    const messages = buildAgentMessages(
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
      ],
      environment
    );

    expect(messages).toHaveLength(2);
    expect(messages[1]?.tool_calls).toHaveLength(1);
  });

  it("keeps assistant messages that only contain reasoning content", () => {
    const messages = buildAgentMessages(
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
});
