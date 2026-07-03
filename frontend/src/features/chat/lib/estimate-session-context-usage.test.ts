import { describe, expect, it } from "vitest";

import type { MessageRecord } from "@/lib/db";
import { createModelDefinition } from "@/lib/model-provider/model-definition";

import {
  estimateSessionContextUsage,
  estimateTextTokens,
} from "./estimate-session-context-usage";

const models = [createModelDefinition("gpt-4o", { contextWindow: 128_000 })];

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
  it("returns null when there are no messages", () => {
    expect(
      estimateSessionContextUsage({
        messages: [],
        modelId: "gpt-4o",
        models,
        systemPrompt: "system",
      })
    ).toBeNull();
  });

  it("includes system prompt and splits assistant output from input", () => {
    const usage = estimateSessionContextUsage({
      messages: [
        createMessage({ id: "user-1", role: "user", content: "Hello" }),
        createMessage({
          id: "assistant-1",
          role: "assistant",
          content: "Hi there",
          thinking: "think",
        }),
      ],
      modelId: "gpt-4o",
      models,
      systemPrompt: "You are helpful.",
    });

    expect(usage).not.toBeNull();
    expect(usage?.maxTokens).toBe(128_000);
    expect(usage?.usage.inputTokens).toBeGreaterThan(0);
    expect(usage?.usage.outputTokens).toBeGreaterThan(0);
    expect(usage?.usage.reasoningTokens).toBeGreaterThan(0);
    expect(usage?.usedTokens).toBe(
      (usage?.usage.inputTokens ?? 0) +
        (usage?.usage.outputTokens ?? 0) +
        (usage?.usage.reasoningTokens ?? 0)
    );
  });

  it("truncates messages after the message being edited", () => {
    const first = createMessage({
      id: "user-1",
      role: "user",
      content: "First",
    });
    const second = createMessage({
      id: "user-2",
      role: "user",
      content: "Second with much longer content to increase token count",
    });

    const full = estimateSessionContextUsage({
      messages: [first, second],
      modelId: "gpt-4o",
      models,
    });
    const truncated = estimateSessionContextUsage({
      messages: [first, second],
      editingMessageId: "user-1",
      modelId: "gpt-4o",
      models,
    });

    expect(full?.usedTokens ?? 0).toBeGreaterThan(truncated?.usedTokens ?? 0);
  });
});
