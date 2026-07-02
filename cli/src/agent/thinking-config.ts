/**
 * Thinking config — per-provider API parameters for toggling deep thinking.
 *
 * Mirrors the web app's @/lib/model-provider/thinking-config.ts.
 * Each provider uses a different API convention for enabling/disabling reasoning.
 */

/**
 * Resolve the thinking extension parameters to merge into the chat completions
 * request body. Returns undefined when no parameters are needed (model does not
 * support toggling).
 */
export function resolveThinkingParams(
  provider: string,
  thinkingEnabled: boolean,
): Record<string, unknown> | undefined {
  const config = THINKING_PRESETS[provider];
  if (!config) return undefined;
  return thinkingEnabled ? config.enabled : config.disabled;
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
