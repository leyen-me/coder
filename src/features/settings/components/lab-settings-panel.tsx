import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useLabSettings } from "@/features/lab/use-lab-settings";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { SettingField } from "./setting-field";
import { SettingRow } from "./setting-row";

export function LabSettingsPanel() {
  const { t } = useTranslation();
  const { settings, updateSettings, resetPromptRefineSystemPrompt } =
    useLabSettings();

  return (
    <section className="divide-y">
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
    </section>
  );
}
