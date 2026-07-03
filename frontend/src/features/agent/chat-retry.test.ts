import { describe, expect, it } from "vitest";

import { AgentCancellationError } from "./cancellation";
import {
  buildStreamIdleRecoveryMessages,
  chatRetryDelayMs,
  isCommittedStreamOutputEvent,
  isRetriableChatError,
  isStreamIdleTimeoutError,
  STREAM_IDLE_RECOVERY_USER_MESSAGE,
} from "./chat-retry";

describe("isRetriableChatError", () => {
  it("retries transient API and network failures", () => {
    expect(isRetriableChatError(new Error("Request failed: connection reset"))).toBe(
      true
    );
    expect(isRetriableChatError(new Error("Stream read failed: broken pipe"))).toBe(
      true
    );
    expect(
      isRetriableChatError(
        new Error("Stream read timed out: exceeded 1800s total stream limit")
      )
    ).toBe(true);
    expect(isRetriableChatError(new Error("API error (429): rate limited"))).toBe(
      true
    );
    expect(isRetriableChatError(new Error("API error (503): unavailable"))).toBe(
      true
    );
    expect(isRetriableChatError(new Error("Failed to fetch"))).toBe(true);
    expect(isRetriableChatError(new Error("Response body is empty"))).toBe(true);
  });

  it("does not retry client errors or cancellation", () => {
    expect(isRetriableChatError(new Error("API error (401): unauthorized"))).toBe(
      false
    );
    expect(isRetriableChatError(new Error("API error (400): bad request"))).toBe(
      false
    );
    expect(
      isRetriableChatError(
        new Error("Agent turn ended with status: cancelled")
      )
    ).toBe(false);
    expect(isRetriableChatError(new AgentCancellationError("task-1"))).toBe(
      false
    );
  });
});

describe("isCommittedStreamOutputEvent", () => {
  it("treats assistant stream events as committed output", () => {
    expect(
      isCommittedStreamOutputEvent({
        type: "thinking_delta",
        taskId: "task-1",
        delta: "hmm",
      })
    ).toBe(true);
    expect(
      isCommittedStreamOutputEvent({
        type: "content_delta",
        taskId: "task-1",
        delta: "hi",
      })
    ).toBe(true);
    expect(
      isCommittedStreamOutputEvent({
        type: "tool_call_pending",
        taskId: "task-1",
        toolCallId: "call_1",
        name: "read_file",
      })
    ).toBe(true);
    expect(
      isCommittedStreamOutputEvent({
        type: "status",
        taskId: "task-1",
        status: "running",
      })
    ).toBe(false);
  });
});

describe("isStreamIdleTimeoutError", () => {
  it("detects idle stream timeout messages", () => {
    expect(
      isStreamIdleTimeoutError("Stream read timed out: no data received for 120s")
    ).toBe(true);
    expect(
      isStreamIdleTimeoutError("Stream read timed out: exceeded 1800s total stream limit")
    ).toBe(false);
  });
});

describe("buildStreamIdleRecoveryMessages", () => {
  it("appends a recovery user message after partial assistant output", () => {
    expect(
      buildStreamIdleRecoveryMessages(
        [{ role: "user", content: "继续任务" }],
        { content: "已完成第一步。", reasoningContent: "先分析目录。" }
      )
    ).toEqual([
      { role: "user", content: "继续任务" },
      {
        role: "assistant",
        content: "已完成第一步。",
        reasoning_content: "先分析目录。",
      },
      { role: "user", content: STREAM_IDLE_RECOVERY_USER_MESSAGE },
    ]);
  });

  it("appends only the recovery user message when no partial text exists", () => {
    expect(
      buildStreamIdleRecoveryMessages([{ role: "user", content: "继续任务" }])
    ).toEqual([
      { role: "user", content: "继续任务" },
      { role: "user", content: STREAM_IDLE_RECOVERY_USER_MESSAGE },
    ]);
  });

  it("mentions the pending tool name when only a tool call was in progress", () => {
    expect(
      buildStreamIdleRecoveryMessages(
        [{ role: "user", content: "继续任务" }],
        { content: "", reasoningContent: "", pendingToolName: "write_file" }
      )
    ).toEqual([
      { role: "user", content: "继续任务" },
      {
        role: "user",
        content:
          "（连接超时：模型在调用 write_file 时停止输出。请从上次停下的地方接着完成该工具调用，不要重复已经完成的内容。）",
      },
    ]);
  });
});

describe("chatRetryDelayMs", () => {
  it("uses exponential backoff", () => {
    expect(chatRetryDelayMs(1)).toBe(1000);
    expect(chatRetryDelayMs(2)).toBe(2000);
    expect(chatRetryDelayMs(3)).toBe(4000);
  });
});
