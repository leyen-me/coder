import { describe, expect, it } from "vitest";

import { normalizeMessageProcessSteps } from "./message-process";
import type { MessageProcessStep } from "./types";

describe("normalizeMessageProcessSteps", () => {
  it("converts backend snake_case tool step fields to frontend camelCase", () => {
    const steps = [
      {
        id: "reasoning:0",
        kind: "reasoning",
        text: "thinking",
      },
      {
        id: "tool:call_1",
        kind: "tool",
        tool_call_id: "call_1",
      },
      {
        id: "answer:2",
        kind: "answer",
        text: "done",
      },
    ] as MessageProcessStep[];

    expect(normalizeMessageProcessSteps(steps)).toEqual([
      {
        id: "reasoning:0",
        kind: "reasoning",
        text: "thinking",
      },
      {
        id: "tool:call_1",
        kind: "tool",
        toolCallId: "call_1",
      },
      {
        id: "answer:2",
        kind: "answer",
        text: "done",
      },
    ]);
  });
});
