import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";

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

describe("startAgent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("waits for the SSE subscription before posting /agent/start", async () => {
    const sseResponse = createDeferred<Response>();
    const firstRead = createDeferred<ReadableStreamReadResult<Uint8Array>>();
    const encoder = new TextEncoder();
    const fetchMock = vi.fn((input: string | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/sse/events/task-1")) {
        return sseResponse.promise;
      }

      if (url.endsWith("/agent/start")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true }),
        } as Response);
      }

      throw new Error(`Unexpected fetch: ${url} (${init?.method ?? "GET"})`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const events: Array<{ type: string; status?: string }> = [];
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

    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/sse/events/task-1");

    sseResponse.resolve({
      ok: true,
      body: {
        getReader: () => ({
          read: vi
            .fn()
            .mockImplementationOnce(() => firstRead.promise)
            .mockResolvedValueOnce({ done: true, value: undefined }),
        }),
      },
    } as Response);

    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("POST");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/agent/start");

    firstRead.resolve({
      done: false,
      value: encoder.encode(
        'data: {"type":"status","taskId":"task-1","status":"completed"}\n\n'
      ),
    });

    await runPromise;

    expect(events).toEqual([
      { type: "status", taskId: "task-1", status: "completed" },
    ]);
  });

  it("rejects when starting the agent fails after the SSE connection opens", async () => {
    const fetchMock = vi.fn((input: string | URL) => {
      const url = String(input);

      if (url.endsWith("/sse/events/task-2")) {
        return Promise.resolve({
          ok: true,
          body: {
            getReader: () => ({
              read: vi.fn().mockImplementation(
                () => new Promise<ReadableStreamReadResult<Uint8Array>>(() => {})
              ),
            }),
          },
        } as Response);
      }

      if (url.endsWith("/agent/start")) {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          json: async () => ({
            code: "start_failed",
            message: "backend boom",
          }),
        } as Response);
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      startAgent(
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
      )
    ).rejects.toEqual(new ApiError(500, "start_failed", "backend boom"));
  });
});
