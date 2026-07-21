import { describe, expect, it } from "vitest";

import type { MessageRecord } from "@/lib/db";
import { createModelDefinition } from "@/lib/model-provider/model-definition";

import {
  estimateSessionContextUsage,
  estimateTextTokens,
  modelHistoryFromLatestCompact,
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

  it("uses provider prompt_tokens for input when available, avoiding over-estimation", () => {
    const messages: MessageRecord[] = [
      createMessage({ id: "user-1", role: "user", content: "Hello world" }),
      createMessage({
        id: "assistant-1",
        role: "assistant",
        content: "Hi there",
        usage: { promptTokens: 20, completionTokens: 5, totalTokens: 25 },
      }),
    ];

    const usage = estimateSessionContextUsage({
      messages,
      modelId: "gpt-4o",
      models,
    });

    expect(usage).not.toBeNull();
    // promptTokens (20) covers system prompt + user message input.
    // Without the provider path, estimating "Hello world" (3 tokens) +
    // system prompt would give a different number.
    expect(usage!.usage.inputTokens).toBe(20);
    expect(usage!.usage.outputTokens).toBe(5);
  });

  it("estimates input only for messages after the last provider checkpoint", () => {
    const messages: MessageRecord[] = [
      createMessage({ id: "user-1", role: "user", content: "First" }),
      createMessage({
        id: "assistant-1",
        role: "assistant",
        content: "Response",
        usage: { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
      }),
      // New user message after the checkpoint — not yet sent to the API
      createMessage({
        id: "user-2",
        role: "user",
        content: "Second message with more text",
      }),
    ];

    const usage = estimateSessionContextUsage({
      messages,
      modelId: "gpt-4o",
      models,
      systemPrompt: "You are helpful.",
    });

    expect(usage).not.toBeNull();
    // promptTokens=50 covers system prompt + "First" + "Response"
    // Only "Second message with more text" is estimated on top
    expect(usage!.usage.inputTokens).toBeGreaterThan(50);
    expect(usage!.usage.inputTokens).toBeLessThan(70); // rough sanity
    expect(usage!.usage.outputTokens).toBe(10);
  });

  it("sums completionTokens from all messages with usage", () => {
    const messages: MessageRecord[] = [
      createMessage({ id: "user-1", role: "user", content: "Q1" }),
      createMessage({
        id: "assistant-1",
        role: "assistant",
        content: "A1",
        usage: { promptTokens: 30, completionTokens: 8, totalTokens: 38 },
      }),
      createMessage({ id: "user-2", role: "user", content: "Q2" }),
      createMessage({
        id: "assistant-2",
        role: "assistant",
        content: "A2",
        usage: { promptTokens: 50, completionTokens: 12, totalTokens: 62 },
      }),
    ];

    const usage = estimateSessionContextUsage({
      messages,
      modelId: "gpt-4o",
      models,
    });

    expect(usage).not.toBeNull();
    // Last provider checkpoint is assistant-2 with promptTokens=50
    expect(usage!.usage.inputTokens).toBe(50);
    // Output should sum both assistant completionTokens
    expect(usage!.usage.outputTokens).toBe(20); // 8 + 12
  });

  it("falls back to estimation when no messages have usage", () => {
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
    // Should use estimation path — input and output both > 0
    expect(usage!.usage.inputTokens).toBeGreaterThan(0);
    expect(usage!.usage.outputTokens).toBeGreaterThan(0);
    expect(usage!.usage.reasoningTokens).toBeGreaterThan(0);
  });

  it("drops pre-compact history from context usage after compact", () => {
    const bulky = "word ".repeat(2_000);
    const messages: MessageRecord[] = [
      createMessage({
        id: "old-user",
        role: "user",
        content: bulky,
        createdAt: 1,
      }),
      createMessage({
        id: "old-assistant",
        role: "assistant",
        content: bulky,
        usage: { promptTokens: 80_000, completionTokens: 200, totalTokens: 80_200 },
        createdAt: 2,
      }),
      createMessage({
        id: "kept-user",
        role: "user",
        content: "kept short",
        createdAt: 3,
      }),
      createMessage({
        id: "kept-assistant",
        role: "assistant",
        content: "kept reply",
        createdAt: 4,
      }),
      createMessage({
        id: "compact-1",
        role: "assistant",
        messageKind: "compact",
        content: "## Context Compaction Summary\n\nShort summary.",
        taskId: "kept-user",
        createdAt: 5,
      }),
    ];

    const before = estimateSessionContextUsage({
      messages: messages.filter((message) => message.messageKind !== "compact"),
      modelId: "gpt-4o",
      models,
      systemPrompt: "You are helpful.",
    });
    const after = estimateSessionContextUsage({
      messages,
      modelId: "gpt-4o",
      models,
      systemPrompt: "You are helpful.",
    });

    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(after!.usage.inputTokens).toBeLessThan(before!.usage.inputTokens!);
    // Must not keep using the pre-compact provider checkpoint.
    expect(after!.usage.inputTokens).toBeLessThan(5_000);
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
