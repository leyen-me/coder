import { LOCALE_VALUES } from "@/lib/i18n/constants";
import { useLocale } from "@/lib/i18n/locale-provider";

import { SettingRow } from "./setting-row";
import { SettingSelect } from "./setting-select";

export function GeneralSettingsPanel() {
  const { locale, setLocale, t } = useLocale();

  const localeOptions = LOCALE_VALUES.map((value) => ({
    value,
    label: t(`locale.${value}`),
  }));

  return (
    <section className="divide-y">
      <SettingRow
        label={t("settings.general.languageLabel")}
        description={t("settings.general.languageDescription")}
        control={
          <SettingSelect
            value={locale}
            options={localeOptions}
            onValueChange={setLocale}
            aria-label={t("settings.general.languageAriaLabel")}
          />
        }
      />
    </section>
  );
}
