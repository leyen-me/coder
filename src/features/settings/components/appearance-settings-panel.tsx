import { THEME_PREFERENCE_OPTIONS } from "@/lib/theme/constants";
import { useTheme } from "@/lib/theme/theme-provider";

import { SettingRow } from "./setting-row";
import { SettingSelect } from "./setting-select";

export function AppearanceSettingsPanel() {
  const { preference, setPreference } = useTheme();

  return (
    <section className="divide-y">
      <SettingRow
        label="主题"
        description="选择应用的颜色主题"
        control={
          <SettingSelect
            value={preference}
            options={THEME_PREFERENCE_OPTIONS}
            onValueChange={setPreference}
            aria-label="主题"
          />
        }
      />
    </section>
  );
}
