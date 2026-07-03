import { useMemo, useState } from "react";

import { Textarea } from "@/components/ui/textarea";
import {
  detectThinkingConfigTemplate,
  formatThinkingConfigJson,
  getThinkingConfigTemplate,
  parseThinkingConfigJson,
  THINKING_CONFIG_TEMPLATE_IDS,
  type ModelThinkingConfig,
  type ThinkingConfigTemplateId,
} from "@/lib/model-provider/thinking-config";
import { useLocale } from "@/lib/i18n/locale-provider";

import { SettingSelect } from "./setting-select";

type ThinkingConfigEditorProps = {
  config: ModelThinkingConfig;
  onChange: (config: ModelThinkingConfig) => void;
};

export function ThinkingConfigEditor({
  config,
  onChange,
}: ThinkingConfigEditorProps) {
  const { t } = useLocale();
  const detectedTemplate = useMemo(
    () => detectThinkingConfigTemplate(config),
    [config.disabled, config.enabled]
  );
  const [isCustomMode, setIsCustomMode] = useState(
    () => detectedTemplate === "custom"
  );
  const activeTemplate = isCustomMode ? "custom" : detectedTemplate;

  const templateOptions = THINKING_CONFIG_TEMPLATE_IDS.map((value) => ({
    value,
    label: t(`settings.modelProvider.thinkingTemplates.${value}`),
  }));

  const applyTemplate = (templateId: ThinkingConfigTemplateId) => {
    if (templateId === "custom") {
      setIsCustomMode(true);
      return;
    }

    setIsCustomMode(false);
    const template = getThinkingConfigTemplate(templateId);
    onChange({
      ...template,
      defaultEnabled: config.defaultEnabled ?? template.defaultEnabled,
    });
  };

  const updateEnabledJson = (text: string) => {
    const parsed = parseThinkingConfigJson(text);
    if (!parsed) {
      return;
    }

    setIsCustomMode(true);
    onChange({ ...config, enabled: parsed });
  };

  const updateDisabledJson = (text: string) => {
    const parsed = parseThinkingConfigJson(text);
    if (!parsed) {
      return;
    }

    setIsCustomMode(true);
    onChange({ ...config, disabled: parsed });
  };

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-input bg-background/60 p-3">
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-muted-foreground">
          {t("settings.modelProvider.thinkingTemplateLabel")}
        </label>
        <SettingSelect
          value={activeTemplate}
          options={templateOptions}
          onValueChange={applyTemplate}
          aria-label={t("settings.modelProvider.thinkingTemplateAriaLabel")}
          className="w-full"
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-muted-foreground">
          {t("settings.modelProvider.thinkingEnabledParamsLabel")}
        </label>
        <Textarea
          value={formatThinkingConfigJson(config.enabled)}
          onChange={(event) => updateEnabledJson(event.target.value)}
          readOnly={!isCustomMode}
          aria-label={t("settings.modelProvider.thinkingEnabledParamsAriaLabel")}
          aria-readonly={!isCustomMode}
          className="min-h-24 font-mono text-xs read-only:cursor-default read-only:opacity-80"
          spellCheck={false}
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-muted-foreground">
          {t("settings.modelProvider.thinkingDisabledParamsLabel")}
        </label>
        <Textarea
          value={formatThinkingConfigJson(config.disabled)}
          onChange={(event) => updateDisabledJson(event.target.value)}
          readOnly={!isCustomMode}
          aria-label={t("settings.modelProvider.thinkingDisabledParamsAriaLabel")}
          aria-readonly={!isCustomMode}
          className="min-h-20 font-mono text-xs read-only:cursor-default read-only:opacity-80"
          spellCheck={false}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={config.defaultEnabled ?? true}
          onChange={(event) =>
            onChange({ ...config, defaultEnabled: event.target.checked })
          }
          className="size-4 rounded border-input"
        />
        {t("settings.modelProvider.thinkingDefaultEnabledLabel")}
      </label>
    </div>
  );
}

export { createDefaultThinkingConfigForProvider as createDefaultThinkingConfig } from "@/lib/model-provider/thinking-config";
