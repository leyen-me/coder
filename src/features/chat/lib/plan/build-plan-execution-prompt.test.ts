import { describe, expect, it } from "vitest";

import { buildPlanExecutionPrompt } from "./build-plan-execution-prompt";

describe("buildPlanExecutionPrompt", () => {
  it("wraps plan content with execution instructions", () => {
    const prompt = buildPlanExecutionPrompt("## Step 1\nDo the thing");

    expect(prompt).toContain("implement the following plan");
    expect(prompt).toContain("## Plan (plan.md)");
    expect(prompt).toContain("## Step 1");
    expect(prompt).toContain("Do the thing");
  });

  it("throws when plan content is empty", () => {
    expect(() => buildPlanExecutionPrompt("   ")).toThrow("Plan content is empty");
  });
});
