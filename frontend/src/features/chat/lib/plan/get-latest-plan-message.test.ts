import { describe, expect, it } from "vitest";

import type { MessageRecord } from "@/lib/db";

import {
  canBuildFromPlan,
  getLatestPlanContent,
  getLatestPlanMessage,
} from "./get-latest-plan-message";

function createMessage(
  overrides: Partial<MessageRecord> & Pick<MessageRecord, "id" | "role">
): MessageRecord {
  return {
    sessionId: "session-1",
    content: "",
    thinking: "",
    toolInvocations: [],
    status: "completed",
    taskId: null,
    error: null,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("getLatestPlanMessage", () => {
  it("returns the latest completed plan artifact", () => {
    const messages = [
      createMessage({
        id: "plan-1",
        role: "assistant",
        messageKind: "plan",
        content: "First plan",
        createdAt: 1,
      }),
      createMessage({
        id: "plan-2",
        role: "assistant",
        messageKind: "plan",
        content: "Second plan",
        createdAt: 2,
      }),
    ];

    expect(getLatestPlanMessage(messages)?.id).toBe("plan-2");
    expect(getLatestPlanContent(messages)).toBe("Second plan");
  });

  it("falls back to answer process steps when content is empty", () => {
    const messages = [
      createMessage({
        id: "plan-1",
        role: "assistant",
        messageKind: "plan",
        processSteps: [
          { id: "answer:0", kind: "answer", text: "Plan from process steps" },
        ],
      }),
    ];

    expect(getLatestPlanContent(messages)).toBe("Plan from process steps");
  });

  it("ignores incomplete or non-plan assistant messages", () => {
    const messages = [
      createMessage({
        id: "assistant-1",
        role: "assistant",
        content: "Regular reply",
      }),
      createMessage({
        id: "plan-pending",
        role: "assistant",
        messageKind: "plan",
        content: "Draft plan",
        status: "streaming",
      }),
    ];

    expect(getLatestPlanMessage(messages)).toBeNull();
    expect(getLatestPlanContent(messages)).toBeNull();
    expect(canBuildFromPlan(messages, false)).toBe(false);
  });
});
