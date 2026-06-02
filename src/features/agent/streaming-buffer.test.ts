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
    });
    expect(onFlush).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(50);

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith("msg-1", {
      content: "Hello",
      thinking: "hmm",
    });

    vi.useRealTimers();
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
});
