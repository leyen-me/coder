import { describe, expect, it } from "vitest";

import type { MessageRecord } from "@/lib/db";

import {
  estimateSessionContextUsage,
  estimateTextTokens,
  modelHistoryFromLatestCompact,
} from "./estimate-session-context-usage";

function createMessage(
  overrides: Partial<MessageRecord> & Pick<MessageRecord, "id" | "role">
): MessageRecord {
  return {
    sessionId: "session-1",
    content: "",
    thinking: "",
    processSteps: [],
    toolInvocations: [],
    status: "completed",
    taskId: null,
    error: null,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("estimateTextTokens", () => {
  it("returns zero for empty text", () => {
    expect(estimateTextTokens("")).toBe(0);
  });

  it("estimates latin text with a 4-char heuristic", () => {
    expect(estimateTextTokens("hello world")).toBe(3);
  });

  it("estimates cjk text closer to one token per character", () => {
    expect(estimateTextTokens("你好世界")).toBe(4);
  });
});

describe("estimateSessionContextUsage", () => {
  it("returns null without a backend snapshot", () => {
    expect(
      estimateSessionContextUsage({
        messages: [
          createMessage({ id: "user-1", role: "user", content: "Hello" }),
        ],
        modelId: "gpt-4o",
        models: [],
      })
    ).toBeNull();
  });

  it("reads the same snapshot values the backend uses", () => {
    const usage = estimateSessionContextUsage({
      messages: [
        createMessage({
          id: "user-1",
          role: "user",
          content: "hello",
          createdAt: 10,
        }),
      ],
      modelId: "gpt-4o",
      models: [],
      contextUsageSnapshot: {
        usedTokens: 219_020,
        maxTokens: 1_000_000,
        remainingTokens: 780_980,
        reservedTokens: 250_000,
        triggerThreshold: 0.8,
        source: "provider",
        updatedAt: 20,
      },
    });

    expect(usage).not.toBeNull();
    expect(usage?.usedTokens).toBe(219_020);
    expect(usage?.maxTokens).toBe(1_000_000);
    expect(usage?.usage.inputTokens).toBe(219_020);
    expect(usage?.usage.outputTokens).toBe(0);
  });

  it("returns null for invalid snapshots", () => {
    expect(
      estimateSessionContextUsage({
        messages: [],
        modelId: "gpt-4o",
        models: [],
        contextUsageSnapshot: {
          usedTokens: 0,
          maxTokens: 1_000_000,
          remainingTokens: 1_000_000,
          reservedTokens: 250_000,
          triggerThreshold: 0.8,
          source: "provider",
          updatedAt: 20,
        },
      })
    ).toBeNull();
  });
});

describe("modelHistoryFromLatestCompact", () => {
  it("keeps summary plus first_kept tail", () => {
    const messages = [
      createMessage({ id: "old", role: "user", content: "old", createdAt: 1 }),
      createMessage({ id: "kept", role: "user", content: "kept", createdAt: 2 }),
      createMessage({
        id: "tail",
        role: "assistant",
        content: "tail",
        createdAt: 3,
      }),
      createMessage({
        id: "compact",
        role: "assistant",
        messageKind: "compact",
        content: "summary",
        taskId: "kept",
        createdAt: 4,
      }),
    ];

    expect(
      modelHistoryFromLatestCompact(messages).map((message) => message.id)
    ).toEqual(["compact", "kept", "tail"]);
  });
});
