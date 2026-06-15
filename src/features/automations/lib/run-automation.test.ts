import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AutomationRecord } from "@/lib/db";

import {
  releaseAutomationRunLock,
  resetAutomationRunLocksForTests,
  tryAcquireAutomationRunLock,
} from "./automation-run-lock";
import { queueAutomationRun, runAutomationById } from "./run-automation";

const { getAutomationMock } = vi.hoisted(() => ({
  getAutomationMock: vi.fn(),
}));

vi.mock("@/lib/db/automations", () => ({
  getAutomation: getAutomationMock,
}));

const automation: AutomationRecord = {
  id: "auto-1",
  name: "Daily review",
  description: "",
  cronExpression: "0 9 * * *",
  prompt: "Review changes",
  workspaceDir: null,
  model: "default-model",
  provider: "custom",
  agentMode: "agent",
  thinkingEnabled: false,
  enableEmail: false,
  enabled: true,
  runs: [],
  createdAt: 0,
  updatedAt: 0,
};

describe("runAutomationById", () => {
  beforeEach(() => {
    resetAutomationRunLocksForTests();
    getAutomationMock.mockReset();
  });

  it("returns not_found when automation does not exist", async () => {
    getAutomationMock.mockResolvedValue(null);

    await expect(runAutomationById("missing")).resolves.toBe("not_found");
  });

  it("returns already_running when a run lock is already held", async () => {
    getAutomationMock.mockResolvedValue(automation);
    expect(tryAcquireAutomationRunLock(automation.id)).toBe(true);

    expect(await runAutomationById(automation.id)).toBe("already_running");

    releaseAutomationRunLock(automation.id);
  });
});

describe("queueAutomationRun", () => {
  beforeEach(() => {
    resetAutomationRunLocksForTests();
  });

  it("returns already_running when the automation is already executing", () => {
    expect(tryAcquireAutomationRunLock(automation.id)).toBe(true);
    expect(queueAutomationRun(automation)).toBe("already_running");
    releaseAutomationRunLock(automation.id);
  });
});
