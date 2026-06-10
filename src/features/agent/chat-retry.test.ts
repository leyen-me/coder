import { describe, expect, it } from "vitest";

import { AgentCancellationError } from "./cancellation";
import {
  chatRetryDelayMs,
  isCommittedStreamOutputEvent,
  isRetriableChatError,
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

describe("chatRetryDelayMs", () => {
  it("uses exponential backoff", () => {
    expect(chatRetryDelayMs(1)).toBe(1000);
    expect(chatRetryDelayMs(2)).toBe(2000);
    expect(chatRetryDelayMs(3)).toBe(4000);
  });
});
