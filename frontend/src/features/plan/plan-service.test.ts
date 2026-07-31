import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";

import {
  isPlanNotFoundError,
  parsePlanApiError,
} from "./plan-service";

describe("parsePlanApiError", () => {
  it("reads structured API error payloads", () => {
    expect(
      parsePlanApiError({
        code: "plan_not_found",
        message: "Plan not found: .coder/plan/old-plan.md",
      })
    ).toEqual({
      code: "plan_not_found",
      message: "Plan not found: .coder/plan/old-plan.md",
    });
  });

  it("does not stringify objects as [object Object]", () => {
    expect(parsePlanApiError({ code: "io_error" }).message).not.toBe(
      "[object Object]"
    );
  });

  it("detects plan_not_found errors", () => {
    expect(
      isPlanNotFoundError({
        code: "plan_not_found",
        message: "Plan not found",
      })
    ).toBe(true);
  });

  it("reads ApiError payloads from the HTTP client", () => {
    expect(
      parsePlanApiError(
        new ApiError(400, "plan_not_found", "Plan not found: .coder/plan/old-plan.md")
      )
    ).toEqual({
      code: "plan_not_found",
      message: "Plan not found: .coder/plan/old-plan.md",
    });
  });
});
