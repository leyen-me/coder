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

  it("keeps decision steps with null responses", () => {
    const steps = [
      {
        id: "decision:1",
        kind: "decision",
        trigger: "final_answer",
        summary: "summary",
        question: "question",
        options: [
          { id: "complete", label: "Complete" },
          { id: "continue", label: "Continue" },
        ],
        risk_level: "medium",
        status: "requested",
        requires_user_confirmation: false,
        response: null,
      },
    ] as unknown as MessageProcessStep[];

    expect(normalizeMessageProcessSteps(steps)).toEqual([
      {
        id: "decision:1",
        kind: "decision",
        trigger: "final_answer",
        summary: "summary",
        question: "question",
        options: [
          { id: "complete", label: "Complete" },
          { id: "continue", label: "Continue" },
        ],
        riskLevel: "medium",
        status: "requested",
        requiresUserConfirmation: false,
        response: null,
      },
    ]);
  });
});
