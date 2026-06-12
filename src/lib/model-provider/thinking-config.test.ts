import { describe, expect, it } from "vitest";

import {
  AGNES_THINKING_CONFIG,
  CHAT_TEMPLATE_THINKING_CONFIG,
  createDefaultThinkingConfigForProvider,
  DEEPSEEK_THINKING_CONFIG,
  detectThinkingConfigTemplate,
  EMPTY_THINKING_CONFIG,
  getThinkingConfigTemplate,
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

describe("detectThinkingConfigTemplate", () => {
  it("detects known presets", () => {
    expect(detectThinkingConfigTemplate(GLM_THINKING_CONFIG)).toBe("glm");
    expect(detectThinkingConfigTemplate(DEEPSEEK_THINKING_CONFIG)).toBe(
      "deepseek"
    );
    expect(detectThinkingConfigTemplate(CHAT_TEMPLATE_THINKING_CONFIG)).toBe(
      "chat-template"
    );
    expect(detectThinkingConfigTemplate(EMPTY_THINKING_CONFIG)).toBe("none");
  });

  it("falls back to custom for unmatched configs", () => {
    expect(
      detectThinkingConfigTemplate({
        enabled: { thinking: { type: "enabled" } },
        disabled: {},
      })
    ).toBe("custom");
    expect(detectThinkingConfigTemplate(AGNES_THINKING_CONFIG)).toBe("custom");
  });
});

describe("getThinkingConfigTemplate", () => {
  it("returns cloned preset configs", () => {
    const template = getThinkingConfigTemplate("deepseek");
    expect(template).toEqual(DEEPSEEK_THINKING_CONFIG);
    template.enabled.reasoning_effort = "low";
    expect(DEEPSEEK_THINKING_CONFIG.enabled.reasoning_effort).toBe("high");
  });
});
