import { Textarea } from "@/components/ui/textarea";
import {
  GLM_THINKING_CONFIG,
  formatThinkingConfigJson,
  parseThinkingConfigJson,
  type ModelThinkingConfig,
} from "@/lib/model-provider/thinking-config";
import { useLocale } from "@/lib/i18n/locale-provider";

type ThinkingConfigEditorProps = {
  config: ModelThinkingConfig;
  onChange: (config: ModelThinkingConfig) => void;
};

export function ThinkingConfigEditor({
  config,
  onChange,
}: ThinkingConfigEditorProps) {
  const { t } = useLocale();

  const updateEnabledJson = (text: string) => {
    const parsed = parseThinkingConfigJson(text);
    if (parsed) {
      onChange({ ...config, enabled: parsed });
    }
  };

  const updateDisabledJson = (text: string) => {
    const parsed = parseThinkingConfigJson(text);
    if (parsed) {
      onChange({ ...config, disabled: parsed });
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-input bg-background/60 p-3">
      <p className="text-xs text-muted-foreground">
        {t("settings.modelProvider.thinkingConfigDescription")}
      </p>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          {t("settings.modelProvider.thinkingEnabledParamsLabel")}
        </label>
        <Textarea
          value={formatThinkingConfigJson(config.enabled)}
          onChange={(event) => updateEnabledJson(event.target.value)}
          aria-label={t("settings.modelProvider.thinkingEnabledParamsAriaLabel")}
          className="min-h-24 font-mono text-xs"
          spellCheck={false}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          {t("settings.modelProvider.thinkingDisabledParamsLabel")}
        </label>
        <Textarea
          value={formatThinkingConfigJson(config.disabled)}
          onChange={(event) => updateDisabledJson(event.target.value)}
          aria-label={t("settings.modelProvider.thinkingDisabledParamsAriaLabel")}
          className="min-h-20 font-mono text-xs"
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

export function createDefaultThinkingConfig(): ModelThinkingConfig {
  return {
    enabled: { ...GLM_THINKING_CONFIG.enabled },
    disabled: { ...GLM_THINKING_CONFIG.disabled },
    defaultEnabled: GLM_THINKING_CONFIG.defaultEnabled,
  };
}
