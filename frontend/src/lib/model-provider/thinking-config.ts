export type ModelThinkingConfig = {
  enabled: Record<string, unknown>;
  disabled: Record<string, unknown>;
  defaultEnabled?: boolean;
};

export type ThinkingConfigTemplateId =
  | "glm"
  | "deepseek"
  | "chat-template"
  | "none"
  | "custom";

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

export const MINIMAX_THINKING_CONFIG: ModelThinkingConfig = {
  enabled: {
    thinking: { type: "adaptive" },
    reasoning_split: true,
  },
  disabled: {
    thinking: { type: "disabled" },
  },
  defaultEnabled: true,
};

export const EMPTY_THINKING_CONFIG: ModelThinkingConfig = {
  enabled: {},
  disabled: {},
  defaultEnabled: false,
};

export const CHAT_TEMPLATE_THINKING_CONFIG: ModelThinkingConfig = {
  enabled: { ...NVIDIA_THINKING_CONFIG.enabled },
  disabled: { ...NVIDIA_THINKING_CONFIG.disabled },
  defaultEnabled: NVIDIA_THINKING_CONFIG.defaultEnabled,
};

export const THINKING_CONFIG_TEMPLATE_IDS = [
  "glm",
  "deepseek",
  "chat-template",
  "none",
  "custom",
] as const satisfies readonly ThinkingConfigTemplateId[];

const THINKING_CONFIG_TEMPLATES: Record<
  Exclude<ThinkingConfigTemplateId, "custom">,
  ModelThinkingConfig
> = {
  glm: GLM_THINKING_CONFIG,
  deepseek: DEEPSEEK_THINKING_CONFIG,
  "chat-template": CHAT_TEMPLATE_THINKING_CONFIG,
  none: EMPTY_THINKING_CONFIG,
};

export function getThinkingConfigTemplate(
  templateId: Exclude<ThinkingConfigTemplateId, "custom">
): ModelThinkingConfig {
  const template = THINKING_CONFIG_TEMPLATES[templateId];

  return {
    enabled: { ...template.enabled },
    disabled: { ...template.disabled },
    defaultEnabled: template.defaultEnabled,
  };
}

function thinkingConfigParamsEqual(
  left: Record<string, unknown>,
  right: Record<string, unknown>
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function detectThinkingConfigTemplate(
  config: Pick<ModelThinkingConfig, "enabled" | "disabled">
): ThinkingConfigTemplateId {
  for (const templateId of THINKING_CONFIG_TEMPLATE_IDS) {
    if (templateId === "custom") {
      continue;
    }

    const template = THINKING_CONFIG_TEMPLATES[templateId];
    if (
      thinkingConfigParamsEqual(config.enabled, template.enabled) &&
      thinkingConfigParamsEqual(config.disabled, template.disabled)
    ) {
      return templateId;
    }
  }

  return "custom";
}

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
