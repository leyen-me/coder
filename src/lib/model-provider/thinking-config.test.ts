import { describe, expect, it } from "vitest";

import {
  DEEPSEEK_THINKING_CONFIG,
  GLM_THINKING_CONFIG,
  parseThinkingConfigJson,
  resolveThinkingRequestParams,
} from "./thinking-config";

describe("resolveThinkingRequestParams", () => {
  it("returns enabled params when thinking is on", () => {
    expect(resolveThinkingRequestParams(DEEPSEEK_THINKING_CONFIG, true)).toEqual(
      DEEPSEEK_THINKING_CONFIG.enabled
    );
  });

  it("returns disabled params when thinking is off", () => {
    expect(resolveThinkingRequestParams(GLM_THINKING_CONFIG, false)).toEqual(
      GLM_THINKING_CONFIG.disabled
    );
  });

  it("returns undefined without config", () => {
    expect(resolveThinkingRequestParams(undefined, true)).toBeUndefined();
  });
});

describe("parseThinkingConfigJson", () => {
  it("parses valid JSON objects", () => {
    expect(parseThinkingConfigJson('{"thinking":{"type":"enabled"}}')).toEqual({
      thinking: { type: "enabled" },
    });
  });

  it("rejects invalid JSON", () => {
    expect(parseThinkingConfigJson("{invalid")).toBeNull();
    expect(parseThinkingConfigJson("[]")).toBeNull();
  });
});
