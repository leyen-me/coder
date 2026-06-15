import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AutomationRecord } from "@/lib/db";

import { isAutomationDue } from "./is-automation-due";

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

describe("isAutomationDue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-11T10:30:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false for invalid cron expressions", () => {
    expect(
      isAutomationDue(
        createAutomation({
          cronExpression: "not-a-cron",
        })
      )
    ).toBe(false);
  });

  it("returns true on first run when the previous slot is in the past", () => {
    expect(
      isAutomationDue(
        createAutomation({
          runs: [],
        })
      )
    ).toBe(true);
  });

  it("returns false when the previous slot was already covered by the latest run", () => {
    expect(
      isAutomationDue(
        createAutomation({
          runs: [
            {
              id: "run-1",
              sessionId: "session-1",
              startedAt: new Date("2026-06-11T10:15:00").getTime(),
              completedAt: new Date("2026-06-11T10:15:00").getTime(),
              summary: "done",
              status: "completed",
            },
          ],
        })
      )
    ).toBe(false);
  });

  it("returns true when a new scheduled slot has passed since the latest run", () => {
    expect(
      isAutomationDue(
        createAutomation({
          runs: [
            {
              id: "run-1",
              sessionId: "session-1",
              startedAt: new Date("2026-06-11T09:15:00").getTime(),
              completedAt: new Date("2026-06-11T09:15:00").getTime(),
              summary: "done",
              status: "completed",
            },
          ],
        })
      )
    ).toBe(true);
  });
});
