import { DEFAULT_THEME, THEME_OPTIONS } from "../constants";
import { SettingRow } from "./setting-row";
import { SettingValueTrigger } from "./setting-value-trigger";

const defaultThemeLabel =
  THEME_OPTIONS.find((option) => option.value === DEFAULT_THEME)?.label ??
  "浅色";

export function AppearanceSettingsPanel() {
  return (
    <section className="divide-y">
      <SettingRow
        label="主题"
        description="选择应用的颜色主题"
        control={
          <SettingValueTrigger value={defaultThemeLabel} aria-label="主题" />
        }
      />
    </section>
  );
}
