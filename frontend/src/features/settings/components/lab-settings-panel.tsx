import { Switch } from "@/components/ui/switch";
import { useLabSettings } from "@/features/lab/use-lab-settings";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { SettingRow } from "./setting-row";

export function LabSettingsPanel() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useLabSettings();

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
    </section>
  );
}
