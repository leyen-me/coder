/**
 * Thinking config — per-provider API parameters for toggling deep thinking.
 *
 * Mirrors the web app's @/lib/model-provider/thinking-config.ts.
 * Each provider uses a different API convention for enabling/disabling reasoning.
 */

export type ThinkingParamsOverride = {
  enabled: Record<string, unknown>;
  disabled: Record<string, unknown>;
};

/**
 * Resolve the thinking extension parameters to merge into the chat completions
 * request body. Returns undefined when no parameters are needed (provider does
 * not have a preset and no custom override was supplied).
 */
export function resolveThinkingParams(
  provider: string,
  thinkingEnabled: boolean,
  override?: ThinkingParamsOverride,
): Record<string, unknown> | undefined {
  // Custom override takes precedence (for e.g. custom provider)
  if (override) {
    return thinkingEnabled ? override.enabled : override.disabled;
  }
  const preset = THINKING_PRESETS[provider];
  if (!preset) return undefined;
  return thinkingEnabled ? preset.enabled : preset.disabled;
}

const THINKING_PRESETS: Record<string, { enabled: Record<string, unknown>; disabled: Record<string, unknown> }> = {
  deepseek: {
    // @see https://api-docs.deepseek.com/guides/thinking_mode
    enabled: {
      thinking: { type: "enabled" },
      reasoning_effort: "high",
    },
    disabled: { thinking: { type: "disabled" } },
  },
  glm: {
    enabled: { thinking: { type: "enabled" } },
    disabled: { thinking: { type: "disabled" } },
  },
  agnes: {
    enabled: { chat_template_kwargs: { enable_thinking: true } },
    disabled: {},
  },
  nvidia: {
    enabled: { chat_template_kwargs: { enable_thinking: true } },
    disabled: { chat_template_kwargs: { enable_thinking: false } },
  },
  minimax: {
    enabled: {
      thinking: { type: "adaptive" },
      reasoning_split: true,
    },
    disabled: { thinking: { type: "disabled" } },
  },
};
