import { describe, expect, it } from "vitest";

import { buildPlanExecutionPrompt } from "./build-plan-execution-prompt";

describe("buildPlanExecutionPrompt", () => {
  it("wraps plan content with execution instructions", () => {
    const prompt = buildPlanExecutionPrompt("## Step 1\nDo the thing");

    expect(prompt).toContain("implement the following plan");
    expect(prompt).toContain("## Plan (.coder/plan/)");
    expect(prompt).toContain("## Step 1");
    expect(prompt).toContain("Do the thing");
  });

  it("includes the plan file path when provided", () => {
    const prompt = buildPlanExecutionPrompt(
      "## Step 1\nDo the thing",
      ".coder/plan/refactor-auth-plan.md"
    );

    expect(prompt).toContain("## Plan (.coder/plan/refactor-auth-plan.md)");
  });

  it("strips conversational wrapper before building", () => {
    const raw = [
      "好的！我先看看。",
      "",
      "## 古风贪吃蛇",
      "Implement UI.",
      "",
      "你觉得怎么样？点击 Build with Agent 开始。",
    ].join("\n");

    const prompt = buildPlanExecutionPrompt(raw);

    expect(prompt).not.toContain("好的");
    expect(prompt).not.toContain("你觉得");
    expect(prompt).toContain("## 古风贪吃蛇");
    expect(prompt).toContain("Implement UI.");
  });

  it("throws when plan content is empty", () => {
    expect(() => buildPlanExecutionPrompt("   ")).toThrow("Plan content is empty");
  });
});
