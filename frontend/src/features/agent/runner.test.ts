import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
const connectAgentSseMock = vi.fn();

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ...actual,
    apiGet: (...args: unknown[]) => apiGetMock(...args),
    apiPost: (...args: unknown[]) => apiPostMock(...args),
  };
});

vi.mock("@/lib/api/sse", () => ({
  connectAgentSse: (...args: unknown[]) => connectAgentSseMock(...args),
}));

import type { AgentEvent } from "./types";
import { startAgent } from "./runner";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function flushMicrotasks(): Promise<void> {
  return Promise.resolve().then(() => undefined);
}

function createMockConnection() {
  const ready = createDeferred<void>();
  const close = vi.fn();
  let onEvent: ((event: AgentEvent) => void) | undefined;
  let onDone: (() => void) | undefined;
  let onError: ((error: string) => void) | undefined;

  connectAgentSseMock.mockImplementationOnce(
    (
      _taskId: string,
      eventHandler: (event: AgentEvent) => void,
      doneHandler: () => void,
      errorHandler: (error: string) => void,
    ) => {
      onEvent = eventHandler;
      onDone = doneHandler;
      onError = errorHandler;
      return { ready: ready.promise, close };
    }
  );

  return {
    ready,
    close,
    emit(event: AgentEvent) {
      onEvent?.(event);
    },
    finish() {
      onDone?.();
    },
    fail(error: string) {
      onError?.(error);
    },
  };
}

describe("startAgent", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    apiPostMock.mockReset();
    connectAgentSseMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("waits for the SSE subscription before posting /agent/start", async () => {
    const connection = createMockConnection();
    apiPostMock.mockResolvedValue({ ok: true });

    const events: AgentEvent[] = [];
    const runPromise = startAgent(
      {
        taskId: "task-1",
        baseUrl: "https://api.example.com",
        apiKey: "secret",
        apiKeySource: "manual",
        apiKeyEnvVar: "OPENAI_API_KEY",
        model: "gpt-test",
        messages: [{ role: "user", content: "hello" }],
      },
      (event) => {
        events.push(event);
      }
    );

    await flushMicrotasks();
    expect(apiPostMock).not.toHaveBeenCalled();

    connection.ready.resolve();
    await flushMicrotasks();
    expect(apiPostMock).toHaveBeenCalledWith(
      "/api/agent/start",
      expect.objectContaining({
        taskId: "task-1",
        model: "gpt-test",
      })
    );

    connection.emit({ type: "status", taskId: "task-1", status: "completed" });
    connection.finish();

    await runPromise;
    expect(events).toEqual([
      { type: "status", taskId: "task-1", status: "completed" },
    ]);
  });

  it("rejects when starting the agent fails after the SSE connection opens", async () => {
    const connection = createMockConnection();
    apiPostMock.mockRejectedValue(
      new ApiError(500, "start_failed", "backend boom")
    );

    const runPromise = startAgent(
      {
        taskId: "task-2",
        baseUrl: "https://api.example.com",
        apiKey: "secret",
        apiKeySource: "manual",
        apiKeyEnvVar: "OPENAI_API_KEY",
        model: "gpt-test",
        messages: [{ role: "user", content: "hello" }],
      },
      () => {}
    );

    connection.ready.resolve();
    await expect(runPromise).rejects.toEqual(
      new ApiError(500, "start_failed", "backend boom")
    );
    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  it("recovers the terminal status when the SSE stream ends without a status event", async () => {
    const connection = createMockConnection();
    apiPostMock
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ taskId: "task-3", status: "completed" });

    const events: AgentEvent[] = [];
    const runPromise = startAgent(
      {
        taskId: "task-3",
        baseUrl: "https://api.example.com",
        apiKey: "secret",
        apiKeySource: "manual",
        apiKeyEnvVar: "OPENAI_API_KEY",
        model: "gpt-test",
        messages: [{ role: "user", content: "hello" }],
      },
      (event) => {
        events.push(event);
      }
    );

    connection.ready.resolve();
    await flushMicrotasks();
    connection.emit({ type: "content_delta", taskId: "task-3", delta: "hi" });
    connection.finish();

    await runPromise;

    expect(apiPostMock).toHaveBeenNthCalledWith(2, "/api/agent/status", {
      taskId: "task-3",
    });
    expect(events).toEqual([
      { type: "content_delta", taskId: "task-3", delta: "hi" },
      { type: "status", taskId: "task-3", status: "completed" },
    ]);
  });

  it("rejects when the stream ends and status recovery is still non-terminal", async () => {
    const connection = createMockConnection();
    apiPostMock
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ taskId: "task-4", status: "running" });

    const events: AgentEvent[] = [];
    const runPromise = startAgent(
      {
        taskId: "task-4",
        baseUrl: "https://api.example.com",
        apiKey: "secret",
        apiKeySource: "manual",
        apiKeyEnvVar: "OPENAI_API_KEY",
        model: "gpt-test",
        messages: [{ role: "user", content: "hello" }],
      },
      (event) => {
        events.push(event);
      }
    );

    connection.ready.resolve();
    await flushMicrotasks();
    connection.finish();

    await expect(runPromise).rejects.toThrow(
      "Agent stream ended before a terminal status event was received. Last known status: running."
    );
    expect(events).toEqual([
      {
        type: "error",
        taskId: "task-4",
        message:
          "Agent stream ended before a terminal status event was received. Last known status: running.",
      },
    ]);
  });
});
