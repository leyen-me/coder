import { describe, expect, it } from "vitest";

import type { AutomationRecord } from "./types";
import {
  getLastAutomationRunAt,
  inferAutomationRunStatus,
  isBlockingRunningRun,
  trimAutomationRuns,
} from "./automation-runs";

function createAutomation(
  overrides: Partial<AutomationRecord> = {}
): AutomationRecord {
  return {
    id: "auto-1",
    name: "Daily review",
    description: "",
    cronExpression: "0 * * * *",
    prompt: "Review changes",
    workspaceDir: null,
    model: "gpt-test",
    provider: "custom",
    agentMode: "agent",
    thinkingEnabled: false,
    enableEmail: false,
    enabled: true,
    runs: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("inferAutomationRunStatus", () => {
  it("maps summary prefixes to run statuses", () => {
    expect(inferAutomationRunStatus("All good")).toBe("completed");
    expect(inferAutomationRunStatus("[failed] timeout")).toBe("failed");
    expect(inferAutomationRunStatus("[error] network")).toBe("failed");
    expect(inferAutomationRunStatus("[cancelled]")).toBe("cancelled");
  });
});

describe("getLastAutomationRunAt", () => {
  it("ignores in-progress runs", () => {
    expect(
      getLastAutomationRunAt(
        createAutomation({
          runs: [
            {
              id: "run-1",
              sessionId: "session-1",
              startedAt: 100,
              completedAt: null,
              summary: "",
              status: "running",
            },
            {
              id: "run-2",
              sessionId: "session-2",
              startedAt: 50,
              completedAt: 80,
              summary: "done",
              status: "completed",
            },
          ],
        })
      )
    ).toBe(80);
  });
});

describe("trimAutomationRuns", () => {
  it("keeps only the newest runs up to the limit", () => {
    const runs = Array.from({ length: 55 }, (_, index) => ({
      id: `run-${index}`,
      sessionId: `session-${index}`,
      startedAt: index,
      completedAt: index,
      summary: `run ${index}`,
      status: "completed" as const,
    }));

    expect(trimAutomationRuns(runs)).toHaveLength(50);
    expect(trimAutomationRuns(runs)[0]?.id).toBe("run-0");
  });
});

describe("isBlockingRunningRun", () => {
  it("treats long-running runs as stale and non-blocking", () => {
    const now = Date.now();
    expect(
      isBlockingRunningRun(
        {
          id: "run-1",
          sessionId: "session-1",
          startedAt: now - 3 * 60 * 60 * 1000,
          completedAt: null,
          summary: "",
          status: "running",
        },
        now,
      ),
    ).toBe(false);
  });

  it("treats recent running runs as blocking", () => {
    const now = Date.now();
    expect(
      isBlockingRunningRun(
        {
          id: "run-1",
          sessionId: "session-1",
          startedAt: now - 5 * 60 * 1000,
          completedAt: null,
          summary: "",
          status: "running",
        },
        now,
      ),
    ).toBe(true);
  });
});
