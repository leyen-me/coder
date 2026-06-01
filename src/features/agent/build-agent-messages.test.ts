import { describe, expect, it } from "vitest";

import {
  AGENT_SYSTEM_PROMPT,
  buildAgentMessages,
} from "@/features/agent/build-agent-messages";

describe("buildAgentMessages", () => {
  it("prepends a system message and drops empty history entries", () => {
    expect(
      buildAgentMessages([
        { role: "user", content: "你好" },
        { role: "assistant", content: "   " },
      ])
    ).toEqual([
      { role: "system", content: AGENT_SYSTEM_PROMPT },
      { role: "user", content: "你好" },
    ]);
  });
});
