export type ModelThinkingConfig = {
  enabled: Record<string, unknown>;
  disabled: Record<string, unknown>;
  defaultEnabled?: boolean;
};

export const GLM_THINKING_CONFIG: ModelThinkingConfig = {
  enabled: { thinking: { type: "enabled" } },
  disabled: { thinking: { type: "disabled" } },
  defaultEnabled: true,
};

/** @see https://api-docs.deepseek.com/zh-cn/guides/thinking_mode */
export const DEEPSEEK_THINKING_CONFIG: ModelThinkingConfig = {
  enabled: {
    thinking: { type: "enabled" },
    reasoning_effort: "high",
  },
  disabled: { thinking: { type: "disabled" } },
  defaultEnabled: true,
};

export const AGNES_THINKING_CONFIG: ModelThinkingConfig = {
  enabled: {
    chat_template_kwargs: { enable_thinking: true },
  },
  disabled: {},
  defaultEnabled: false,
};

export const NVIDIA_THINKING_CONFIG: ModelThinkingConfig = {
  enabled: {
    chat_template_kwargs: { enable_thinking: true },
  },
  disabled: {
    chat_template_kwargs: { enable_thinking: false },
  },
  defaultEnabled: true,
};

export function createDefaultThinkingConfigForProvider(
  provider: "custom" | "nvidia" | string
): ModelThinkingConfig {
  if (provider === "nvidia") {
    return {
      enabled: { ...NVIDIA_THINKING_CONFIG.enabled },
      disabled: { ...NVIDIA_THINKING_CONFIG.disabled },
      defaultEnabled: NVIDIA_THINKING_CONFIG.defaultEnabled,
    };
  }

  return {
    enabled: { ...GLM_THINKING_CONFIG.enabled },
    disabled: { ...GLM_THINKING_CONFIG.disabled },
    defaultEnabled: GLM_THINKING_CONFIG.defaultEnabled,
  };
}

export function normalizeThinkingConfig(
  raw: unknown
): ModelThinkingConfig | undefined {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return undefined;
  }

  const record = raw as Record<string, unknown>;
  const enabled = record.enabled;
  const disabled = record.disabled;

  if (
    enabled === null ||
    typeof enabled !== "object" ||
    Array.isArray(enabled) ||
    disabled === null ||
    typeof disabled !== "object" ||
    Array.isArray(disabled)
  ) {
    return undefined;
  }

  return {
    enabled: { ...(enabled as Record<string, unknown>) },
    disabled: { ...(disabled as Record<string, unknown>) },
    defaultEnabled:
      record.defaultEnabled === true
        ? true
        : record.defaultEnabled === false
          ? false
          : undefined,
  };
}

export function resolveThinkingRequestParams(
  thinkingConfig: ModelThinkingConfig | undefined,
  thinkingEnabled: boolean
): Record<string, unknown> | undefined {
  if (!thinkingConfig) {
    return undefined;
  }

  return thinkingEnabled
    ? thinkingConfig.enabled
    : thinkingConfig.disabled;
}

export function formatThinkingConfigJson(
  value: Record<string, unknown>
): string {
  return JSON.stringify(value, null, 2);
}

export function parseThinkingConfigJson(
  text: string
): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
