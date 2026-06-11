import { describe, expect, it } from "vitest";

import {
  createDefaultThinkingConfigForProvider,
  DEEPSEEK_THINKING_CONFIG,
  GLM_THINKING_CONFIG,
  NVIDIA_THINKING_CONFIG,
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

describe("createDefaultThinkingConfigForProvider", () => {
  it("returns NVIDIA thinking params for the nvidia provider", () => {
    expect(createDefaultThinkingConfigForProvider("nvidia")).toEqual(
      NVIDIA_THINKING_CONFIG
    );
  });

  it("returns GLM thinking params for custom providers", () => {
    expect(createDefaultThinkingConfigForProvider("custom")).toEqual({
      enabled: { ...GLM_THINKING_CONFIG.enabled },
      disabled: { ...GLM_THINKING_CONFIG.disabled },
      defaultEnabled: GLM_THINKING_CONFIG.defaultEnabled,
    });
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
