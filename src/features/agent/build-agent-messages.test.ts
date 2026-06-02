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

  it("keeps assistant messages that only contain tool calls", () => {
    const messages = buildAgentMessages(
      [
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_1",
              name: "list_dir",
              arguments: "{}",
            },
          ],
        },
      ],
      environment
    );

    expect(messages).toHaveLength(2);
    expect(messages[1]?.tool_calls).toHaveLength(1);
  });
});
