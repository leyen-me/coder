import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAgentStatus } from "@/features/agent/runner";
import { appEventBus } from "@/lib/event-bus";

import {
  createAgentTaskCompletionBuffer,
  waitForAgentTaskCompletion,
} from "./wait-for-agent-task-completion";

vi.mock("@/features/agent/runner", () => ({
  getAgentStatus: vi.fn(),
}));

describe("createAgentTaskCompletionBuffer", () => {
  afterEach(() => {
    appEventBus.clear("agent:task_completed");
  });

  it("records completion events before the task id is known", () => {
    const buffer = createAgentTaskCompletionBuffer();

    appEventBus.emit("agent:task_completed", {
      taskId: "task-1",
      status: "completed",
    });

    expect(buffer.take("task-1")).toBe("completed");
    buffer.dispose();
  });
});

describe("waitForAgentTaskCompletion", () => {
  beforeEach(() => {
    vi.mocked(getAgentStatus).mockReset();
    appEventBus.clear("agent:task_completed");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a buffered terminal status immediately", async () => {
    const buffer = createAgentTaskCompletionBuffer();
    appEventBus.emit("agent:task_completed", {
      taskId: "task-1",
      status: "failed",
    });

    await expect(
      waitForAgentTaskCompletion("task-1", buffer)
    ).resolves.toBe("failed");
    expect(getAgentStatus).not.toHaveBeenCalled();
    buffer.dispose();
  });

  it("resolves from a later task_completed event", async () => {
    vi.mocked(getAgentStatus).mockResolvedValue(null);

    const pending = waitForAgentTaskCompletion("task-2");
    await vi.advanceTimersByTimeAsync(0);
    appEventBus.emit("agent:task_completed", {
      taskId: "task-2",
      status: "cancelled",
    });

    await expect(pending).resolves.toBe("cancelled");
  });

  it("falls back to agent status when no completion event is emitted", async () => {
    vi.mocked(getAgentStatus).mockResolvedValue({
      taskId: "task-3",
      status: "completed",
    });

    const pending = waitForAgentTaskCompletion("task-3");
    await vi.advanceTimersByTimeAsync(0);

    await expect(pending).resolves.toBe("completed");
  });

  it("resolves from the buffer after sendMessage returns the task id", async () => {
    vi.mocked(getAgentStatus).mockResolvedValue(null);
    const buffer = createAgentTaskCompletionBuffer();

    appEventBus.emit("agent:task_completed", {
      taskId: "task-4",
      status: "completed",
    });

    const pending = waitForAgentTaskCompletion("task-4", buffer);
    await vi.advanceTimersByTimeAsync(0);

    await expect(pending).resolves.toBe("completed");
    buffer.dispose();
  });
});
