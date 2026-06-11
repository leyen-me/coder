import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getRunningAutomationIds,
  isAutomationRunning,
  releaseAutomationRunLock,
  resetAutomationRunLocksForTests,
  subscribeAutomationRuns,
  tryAcquireAutomationRunLock,
} from "./automation-run-lock";

describe("automation-run-lock", () => {
  beforeEach(() => {
    resetAutomationRunLocksForTests();
  });

  it("acquires and releases a run lock", () => {
    expect(tryAcquireAutomationRunLock("auto-1")).toBe(true);
    expect(isAutomationRunning("auto-1")).toBe(true);
    expect(tryAcquireAutomationRunLock("auto-1")).toBe(false);

    releaseAutomationRunLock("auto-1");
    expect(isAutomationRunning("auto-1")).toBe(false);
    expect(tryAcquireAutomationRunLock("auto-1")).toBe(true);
  });

  it("notifies subscribers when running ids change", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAutomationRuns(listener);

    expect(listener).toHaveBeenCalledWith(new Set());
    tryAcquireAutomationRunLock("auto-1");
    expect(listener).toHaveBeenLastCalledWith(new Set(["auto-1"]));
    releaseAutomationRunLock("auto-1");
    expect(listener).toHaveBeenLastCalledWith(new Set());
    expect(getRunningAutomationIds().size).toBe(0);

    unsubscribe();
  });
});
