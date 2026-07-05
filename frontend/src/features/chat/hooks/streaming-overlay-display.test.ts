import { describe, expect, it } from "vitest";

import type { StreamingFields } from "@/features/agent/streaming-buffer";
import type { MessageRecord } from "@/lib/db";

import {
  hasStreamingOverlayCaughtUp,
  isCachedStreamingOverlayBehindDb,
  mergeActiveAssistantPlaceholders,
} from "./use-session-messages";
import type { ActiveTaskState } from "@/features/agent/types";

function createMessage(
  overrides: Partial<MessageRecord> = {}
): MessageRecord {
  return {
    id: "msg-1",
    sessionId: "session-1",
    role: "assistant",
    content: "",
    thinking: "",
    processSteps: [],
    toolInvocations: [],
    status: "completed",
    createdAt: 0,
    error: null,
    ...overrides,
  };
}

function createCached(overrides: Partial<StreamingFields> = {}): StreamingFields {
  return {
    content: "",
    thinking: "",
    processSteps: [],
    toolInvocations: [],
    ...overrides,
  };
}

describe("streaming overlay display helpers", () => {
  it("detects when DB text has caught up to cached overlay", () => {
    const cached = createCached({
      content: "Hello",
      thinking: "hmm",
      processSteps: [{ id: "answer:0", kind: "answer", text: "Hello" }],
    });
    const message = createMessage({
      content: "Hello",
      thinking: "hmm",
      processSteps: [{ id: "answer:0", kind: "answer", text: "Hello" }],
    });

    expect(hasStreamingOverlayCaughtUp(message, cached)).toBe(true);
    expect(isCachedStreamingOverlayBehindDb(message, cached)).toBe(false);
  });

  it("keeps cached overlay when DB text matches but tool steps are still stale", () => {
    const cached = createCached({
      content: "Done",
      processSteps: [
        { id: "answer:0", kind: "answer", text: "Done" },
        { id: "tool:shell-1", kind: "tool", toolCallId: "shell-1" },
      ],
      toolInvocations: [
        {
          id: "shell-1",
          name: "Shell",
          input: { command: "git status" },
          state: "output-available",
          output: {},
        },
      ],
    });
    const message = createMessage({
      content: "Done",
      processSteps: [{ id: "answer:0", kind: "answer", text: "Done" }],
    });

    expect(hasStreamingOverlayCaughtUp(message, cached)).toBe(false);
    expect(isCachedStreamingOverlayBehindDb(message, cached)).toBe(false);
  });

  it("drops stale cached overlay when DB already has more streamed text", () => {
    const cached = createCached({
      content: "验证一下改动后的文件和 TypeScript 编译：",
      processSteps: [
        {
          id: "answer:0",
          kind: "answer",
          text: "验证一下改动后的文件和 TypeScript 编译：",
        },
      ],
    });
    const message = createMessage({
      content:
        "验证一下改动后的文件和 TypeScript 编译：\n\n已移除快捷键提示，并通过 tsc 验证。",
      processSteps: [
        {
          id: "answer:0",
          kind: "answer",
          text: "验证一下改动后的文件和 TypeScript 编译：\n\n已移除快捷键提示，并通过 tsc 验证。",
        },
      ],
    });

    expect(hasStreamingOverlayCaughtUp(message, cached)).toBe(false);
    expect(isCachedStreamingOverlayBehindDb(message, cached)).toBe(true);
  });

  it("adds a placeholder assistant row for active tasks missing from messages", () => {
    const messages = [
      createMessage({
        id: "user-1",
        role: "user",
        content: "hello",
        status: "completed",
        taskId: null,
      }),
    ];
    const activeTasks = new Map<string, ActiveTaskState>([
      [
        "task-1",
        {
          taskId: "task-1",
          sessionId: "session-1",
          assistantMessageId: "assistant-1",
          status: "running",
          error: null,
          chatRetry: null,
          isFirstTurn: false,
          model: "test-model",
          userContent: "hello",
          thinkingEnabled: false,
          handoff: null,
          agentMode: "agent",
          sessionKind: "standard",
          autonomyMode: "interactive",
          decisionPolicyVersion: "mvp-v1",
          decisionModel: "test-model",
        },
      ],
    ]);

    const merged = mergeActiveAssistantPlaceholders(
      messages,
      activeTasks,
      "session-1"
    );

    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({
      id: "assistant-1",
      role: "assistant",
      sessionId: "session-1",
      status: "streaming",
      taskId: "task-1",
    });
  });
});
