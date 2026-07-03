import { describe, expect, it } from "vitest";

import { extractPlanBodyForExecution } from "./extract-plan-body";

describe("extractPlanBodyForExecution", () => {
  it("removes conversational preamble before the first heading", () => {
    const raw = [
      "好的！让我先看看项目结构，然后出一份方案。",
      "",
      "---",
      "",
      "## 古风贪吃蛇计划",
      "",
      "### Step 1",
      "Define colors.",
    ].join("\n");

    expect(extractPlanBodyForExecution(raw)).toBe(
      ["## 古风贪吃蛇计划", "", "### Step 1", "Define colors."].join("\n")
    );
  });

  it("removes trailing confirmation questions", () => {
    const raw = [
      "## Plan",
      "",
      "Do the work.",
      "",
      "---",
      "",
      "你觉得这个方向怎么样？如果确认了，我可以生成 plan.md，然后你点击 Build with Agent。",
    ].join("\n");

    expect(extractPlanBodyForExecution(raw)).toBe(
      ["## Plan", "", "Do the work."].join("\n")
    );
  });

  it("returns trimmed content when no heading is present", () => {
    expect(extractPlanBodyForExecution("  plain text  ")).toBe("plain text");
  });
});
