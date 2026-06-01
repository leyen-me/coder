import {
  DEFAULT_LANGUAGE,
  LANGUAGE_OPTIONS,
} from "../constants";
import { SettingRow } from "./setting-row";
import { SettingValueTrigger } from "./setting-value-trigger";

const defaultLanguageLabel =
  LANGUAGE_OPTIONS.find((option) => option.value === DEFAULT_LANGUAGE)?.label ??
  "中文";

export function GeneralSettingsPanel() {
  return (
    <section className="divide-y">
      <SettingRow
        label="语言"
        description="选择界面显示语言"
        control={
          <SettingValueTrigger
            value={defaultLanguageLabel}
            aria-label="语言"
          />
        }
      />
    </section>
  );
}
