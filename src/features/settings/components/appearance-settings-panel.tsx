import { useLocale } from "@/lib/i18n/locale-provider";
import { THEME_PREFERENCE_VALUES } from "@/lib/theme/constants";
import { useTheme } from "@/lib/theme/theme-provider";

import { SettingRow } from "./setting-row";
import { SettingSelect } from "./setting-select";

export function AppearanceSettingsPanel() {
  const { preference, setPreference } = useTheme();
  const { t } = useLocale();

  const themeOptions = THEME_PREFERENCE_VALUES.map((value) => ({
    value,
    label: t(`theme.${value}`),
  }));

  return (
    <section className="divide-y">
      <SettingRow
        label={t("settings.appearance.themeLabel")}
        description={t("settings.appearance.themeDescription")}
        control={
          <SettingSelect
            value={preference}
            options={themeOptions}
            onValueChange={setPreference}
            aria-label={t("settings.appearance.themeAriaLabel")}
          />
        }
      />
    </section>
  );
}
