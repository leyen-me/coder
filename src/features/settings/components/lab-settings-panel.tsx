import { Switch } from "@/components/ui/switch";
import { usePromptRefineEnabled } from "@/features/lab/use-prompt-refine-enabled";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { SettingRow } from "./setting-row";

export function LabSettingsPanel() {
  const { t } = useTranslation();
  const { enabled, setEnabled } = usePromptRefineEnabled();

  return (
    <section className="divide-y">
      <SettingRow
        label={t("settings.lab.promptRefineLabel")}
        description={t("settings.lab.promptRefineDescription")}
        control={
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-label={t("settings.lab.promptRefineAriaLabel")}
          />
        }
      />
    </section>
  );
}
