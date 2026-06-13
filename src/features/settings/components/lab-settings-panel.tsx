import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RESPONSE_STYLE_PRESETS } from "@/features/lab/constants";
import { useLabSettings } from "@/features/lab/use-lab-settings";
import { useTranslation } from "@/lib/i18n/locale-provider";
import type { MessageKey } from "@/lib/i18n/messages";

import { SettingField } from "./setting-field";
import { SettingRow } from "./setting-row";

export function LabSettingsPanel() {
  const { t } = useTranslation();
  const {
    settings,
    updateSettings,
    resetPromptRefineSystemPrompt,
    toggleResponseStyle,
    selectResponseStyle,
    updateResponseStyleCustomPrompt,
    resetResponseStyleCustomPrompt,
  } = useLabSettings();

  const {
    enabled: styleEnabled,
    selectedKey: styleSelectedKey,
    customPrompts: styleCustomPrompts,
  } = settings.responseStyle;

  return (
    <section className="divide-y">
      <SettingRow
        label={t("settings.lab.longTaskLabel")}
        description={t("settings.lab.longTaskDescription")}
        control={
          <Switch
            checked={settings.longTaskEnabled}
            onCheckedChange={(checked) => {
              updateSettings({ longTaskEnabled: checked });
            }}
            aria-label={t("settings.lab.longTaskAriaLabel")}
          />
        }
      />

      <SettingRow
        label={t("settings.lab.promptRefineLabel")}
        description={t("settings.lab.promptRefineDescription")}
        control={
          <Switch
            checked={settings.promptRefineEnabled}
            onCheckedChange={(checked) => {
              updateSettings({ promptRefineEnabled: checked });
            }}
            aria-label={t("settings.lab.promptRefineAriaLabel")}
          />
        }
      />

      {settings.promptRefineEnabled && (
        <SettingField
          label={t("settings.lab.promptRefineSystemPromptLabel")}
          description={t("settings.lab.promptRefineSystemPromptDescription")}
        >
          <Textarea
            aria-label={t("settings.lab.promptRefineSystemPromptAriaLabel")}
            className="min-h-48 font-mono text-sm"
            onChange={(event) => {
              updateSettings({ promptRefineSystemPrompt: event.target.value });
            }}
            value={settings.promptRefineSystemPrompt}
          />
          <div className="flex justify-end pt-2">
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={resetPromptRefineSystemPrompt}
            >
              {t("settings.lab.promptRefineSystemPromptReset")}
            </Button>
          </div>
        </SettingField>
      )}

      {/* Response Style Section */}
      <SettingRow
        label={t("settings.lab.responseStyleLabel")}
        description={t("settings.lab.responseStyleDescription")}
        control={
          <Switch
            checked={styleEnabled}
            onCheckedChange={toggleResponseStyle}
            aria-label={t("settings.lab.responseStyleAriaLabel")}
          />
        }
      />

      {styleEnabled && (
        <SettingField
          label={t("settings.lab.responseStyleSelectLabel")}
        >
          <RadioGroup
            value={styleSelectedKey}
            onValueChange={selectResponseStyle}
            className="grid gap-2"
          >
            {RESPONSE_STYLE_PRESETS.map((preset) => (
              <div key={preset.key} className="flex items-center gap-3 py-1">
                <RadioGroupItem
                  value={preset.key}
                  id={`style-${preset.key}`}
                />
                <Label htmlFor={`style-${preset.key}`} className="font-normal">
                  {t(preset.nameKey as MessageKey)}
                </Label>
              </div>
            ))}
          </RadioGroup>

          {styleSelectedKey !== "normal" && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t("settings.lab.responseStyleCustomPromptLabel")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("settings.lab.responseStyleCustomPromptDescription")}
              </p>
              <Textarea
                aria-label={t("settings.lab.responseStyleCustomPromptLabel")}
                className="min-h-32 font-mono text-sm"
                onChange={(event) => {
                  updateResponseStyleCustomPrompt(
                    styleSelectedKey,
                    event.target.value
                  );
                }}
                value={styleCustomPrompts[styleSelectedKey] ?? ""}
                placeholder={
                  RESPONSE_STYLE_PRESETS.find(
                    (p) => p.key === styleSelectedKey
                  )?.defaultPrompt ?? ""
                }
              />
              <div className="flex justify-end pt-1">
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    resetResponseStyleCustomPrompt(styleSelectedKey)
                  }
                >
                  {t("settings.lab.responseStyleCustomPromptReset")}
                </Button>
              </div>
            </div>
          )}
        </SettingField>
      )}
    </section>
  );
}
