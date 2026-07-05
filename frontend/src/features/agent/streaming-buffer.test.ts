import { describe, expect, it, vi } from "vitest";

import { createStreamingBufferManager } from "./streaming-buffer";

describe("createStreamingBufferManager", () => {
  it("batches deltas and flushes accumulated fields", async () => {
    vi.useFakeTimers();
    const onFlush = vi.fn().mockResolvedValue(undefined);
    const onChange = vi.fn();

    const manager = createStreamingBufferManager({ onFlush, onChange });

    manager.append("msg-1", "content", "Hel");
    manager.append("msg-1", "content", "lo");
    manager.append("msg-1", "thinking", "hmm");

    expect(manager.get("msg-1")).toEqual({
      content: "Hello",
      thinking: "hmm",
      processSteps: [
        { id: "answer:0", kind: "answer", text: "Hello" },
        { id: "reasoning:1", kind: "reasoning", text: "hmm" },
      ],
      toolInvocations: [],
    });
    expect(onFlush).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(50);

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith("msg-1", {
      content: "Hello",
      thinking: "hmm",
      processSteps: [
        { id: "answer:0", kind: "answer", text: "Hello" },
        { id: "reasoning:1", kind: "reasoning", text: "hmm" },
      ],
      toolInvocations: [],
    });

    vi.useRealTimers();
  });

  it("batches onChange notifications to one animation frame", () => {
    const rafCallbacks: Array<() => void> = [];
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});

    const onChange = vi.fn();
    const manager = createStreamingBufferManager({
      onFlush: vi.fn().mockResolvedValue(undefined),
      onChange,
    });

    manager.append("msg-1", "content", "a");
    manager.append("msg-1", "content", "b");
    expect(onChange).not.toHaveBeenCalled();

    rafCallbacks.forEach((callback) => callback());
    expect(onChange).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("clear removes overlay without flushing", () => {
    const onFlush = vi.fn().mockResolvedValue(undefined);

    const manager = createStreamingBufferManager({
      onFlush,
      onChange: () => {},
    });

    manager.append("msg-1", "content", "keep");
    manager.clear("msg-1");

    expect(onFlush).not.toHaveBeenCalled();
    expect(manager.get("msg-1")).toBeNull();
  });

  it("flushAndClear removes overlay after final flush", async () => {
    vi.useFakeTimers();
    const onFlush = vi.fn().mockResolvedValue(undefined);

    const manager = createStreamingBufferManager({
      onFlush,
      onChange: () => {},
    });

    manager.append("msg-1", "content", "done");
    await manager.flushAndClear("msg-1");

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(manager.get("msg-1")).toBeNull();
    expect(manager.getSnapshot().size).toBe(0);

    vi.useRealTimers();
  });

  it("preserves DeepSeek-style content before tool steps", () => {
    const manager = createStreamingBufferManager({
      onFlush: vi.fn().mockResolvedValue(undefined),
      onChange: () => {},
    });

    manager.append("msg-1", "thinking", "先打个招呼。");
    manager.append("msg-1", "content", "你好！让我先看看目录。");
    manager.pushToolStep("msg-1", "call_1");
    manager.append("msg-1", "thinking", "目录读完了，再总结。");
    manager.append("msg-1", "content", "项目结构如下。");

    expect(manager.get("msg-1")?.processSteps).toEqual([
      { id: "reasoning:0", kind: "reasoning", text: "先打个招呼。" },
      { id: "answer:1", kind: "answer", text: "你好！让我先看看目录。" },
      { id: "tool:call_1", kind: "tool", toolCallId: "call_1" },
      { id: "reasoning:3", kind: "reasoning", text: "目录读完了，再总结。" },
      { id: "answer:4", kind: "answer", text: "项目结构如下。" },
    ]);
    expect(manager.get("msg-1")).toMatchObject({
      thinking: "先打个招呼。目录读完了，再总结。",
      content: "项目结构如下。",
      toolInvocations: [],
    });
  });

  it("memoizes the derived snapshot until the next mutation", () => {
    const manager = createStreamingBufferManager({
      onFlush: vi.fn().mockResolvedValue(undefined),
      onChange: () => {},
    });

    manager.append("msg-1", "content", "Hello");
    const first = manager.get("msg-1");
    const second = manager.get("msg-1");
    expect(second).toBe(first);

    manager.append("msg-1", "content", " world");
    const third = manager.get("msg-1");
    expect(third).not.toBe(first);
    expect(third?.content).toBe("Hello world");
  });

  it("keeps previously read snapshots immutable as more deltas arrive", () => {
    const manager = createStreamingBufferManager({
      onFlush: vi.fn().mockResolvedValue(undefined),
      onChange: () => {},
    });

    manager.append("msg-1", "content", "Hel");
    const snapshot = manager.get("msg-1");

    manager.append("msg-1", "content", "lo");

    expect(snapshot?.content).toBe("Hel");
    expect(snapshot?.processSteps[0]).toEqual({
      id: "answer:0",
      kind: "answer",
      text: "Hel",
    });
    expect(manager.get("msg-1")?.content).toBe("Hello");
  });

  it("upserts a single tool invocation without replacing the list", () => {
    const manager = createStreamingBufferManager({
      onFlush: vi.fn().mockResolvedValue(undefined),
      onChange: () => {},
    });

    manager.upsertToolInvocation("msg-1", {
      id: "call_1",
      name: "list_dir",
      input: {},
      state: "input-streaming",
    });
    manager.upsertToolInvocation("msg-1", {
      id: "call_1",
      name: "list_dir",
      input: { path: "." },
      state: "input-available",
    });

    expect(manager.get("msg-1")?.toolInvocations).toEqual([
      {
        id: "call_1",
        name: "list_dir",
        input: { path: "." },
        state: "input-available",
      },
    ]);
  });

  it("marks pending tool invocations as failed when the stream errors", () => {
    const manager = createStreamingBufferManager({
      onFlush: vi.fn().mockResolvedValue(undefined),
      onChange: () => {},
    });

    manager.upsertToolInvocation("msg-1", {
      id: "call_1",
      name: "read_file",
      input: {},
      state: "input-streaming",
    });
    manager.failPendingToolInvocations("msg-1", "Stream read timed out");

    expect(manager.get("msg-1")?.toolInvocations).toEqual([
      {
        id: "call_1",
        name: "read_file",
        input: {},
        state: "output-error",
        errorText: "Stream read timed out",
      },
    ]);
  });

  it("updates tool invocations in the live snapshot", () => {
    const manager = createStreamingBufferManager({
      onFlush: vi.fn().mockResolvedValue(undefined),
      onChange: () => {},
    });

    manager.setToolInvocations("msg-1", [
      {
        id: "call_1",
        name: "list_dir",
        input: { path: "." },
        state: "input-available",
      },
    ]);

    expect(manager.get("msg-1")).toMatchObject({
      toolInvocations: [
        expect.objectContaining({
          id: "call_1",
          name: "list_dir",
          state: "input-available",
        }),
      ],
    });
  });

  it("cancels a pending scheduled flush when flush is invoked explicitly", async () => {
    vi.useFakeTimers();
    const onFlush = vi.fn().mockResolvedValue(undefined);

    const manager = createStreamingBufferManager({
      onFlush,
      onChange: () => {},
    });

    manager.append("msg-1", "content", "Hello");
    await manager.flush("msg-1");

    expect(onFlush).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(50);

    expect(onFlush).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("promotes reasoning-only turns on finalize", () => {
    const onChange = vi.fn();
    const manager = createStreamingBufferManager({
      onFlush: vi.fn().mockResolvedValue(undefined),
      onChange,
    });

    manager.append("msg-1", "thinking", "你好！");

    expect(manager.get("msg-1")).toMatchObject({
      content: "",
      thinking: "你好！",
      processSteps: [{ id: "reasoning:0", kind: "reasoning", text: "你好！" }],
    });

    manager.finalize("msg-1");

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(manager.get("msg-1")).toMatchObject({
      content: "你好！",
      thinking: "你好！",
      processSteps: [
        { id: "reasoning:0", kind: "reasoning", text: "你好！" },
        { id: "answer:1", kind: "answer", text: "你好！" },
      ],
    });
  });
});
