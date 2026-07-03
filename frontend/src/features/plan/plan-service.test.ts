import { describe, expect, it } from "vitest";

import {
  isPlanNotFoundError,
  parsePlanInvokeError,
} from "./plan-service";

describe("parsePlanInvokeError", () => {
  it("reads structured tauri invoke errors", () => {
    expect(
      parsePlanInvokeError({
        code: "plan_not_found",
        message: "Plan not found: .plan/old-plan.md",
      })
    ).toEqual({
      code: "plan_not_found",
      message: "Plan not found: .plan/old-plan.md",
    });
  });

  it("does not stringify objects as [object Object]", () => {
    expect(parsePlanInvokeError({ code: "io_error" }).message).not.toBe(
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
});
