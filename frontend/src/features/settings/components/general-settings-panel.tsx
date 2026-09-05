import { useState } from "react";

import { Switch } from "@/components/ui/switch";
import {
  formatSessionThresholdPercent,
  MAX_AGENT_SESSION_THRESHOLD,
  MIN_AGENT_SESSION_THRESHOLD,
  readAgentSessionThreshold,
  readAutoGenerateTitles,
  writeAgentSessionThreshold,
  writeAutoGenerateTitles,
} from "@/features/agent/session-settings";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { LOCALE_VALUES } from "@/lib/i18n/constants";
import { useLocale } from "@/lib/i18n/locale-provider";

import { SettingRow } from "./setting-row";
import { SettingSelect } from "./setting-select";

export function GeneralSettingsPanel() {
  const { locale, setLocale, t } = useLocale();
  const [sessionThresholdInput, setSessionThresholdInput] = useState(() =>
    formatSessionThresholdPercent(readAgentSessionThreshold())
  );
  const [autoGenerateTitles, setAutoGenerateTitles] = useState(
    readAutoGenerateTitles
  );

  const handleAutoGenerateTitlesChange = (checked: boolean) => {
    writeAutoGenerateTitles(checked);
    setAutoGenerateTitles(checked);
  };

  const localeOptions = LOCALE_VALUES.map((value) => ({
    value,
    label: t(`locale.${value}`),
  }));

  const minPercent = MIN_AGENT_SESSION_THRESHOLD * 100;
  const maxPercent = MAX_AGENT_SESSION_THRESHOLD * 100;

  const commitSessionThreshold = (raw: string) => {
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) {
      setSessionThresholdInput(
        formatSessionThresholdPercent(readAgentSessionThreshold())
      );
      return;
    }

    const normalized = Math.min(
      Math.max(parsed / 100, MIN_AGENT_SESSION_THRESHOLD),
      MAX_AGENT_SESSION_THRESHOLD
    );
    writeAgentSessionThreshold(normalized);
    setSessionThresholdInput(formatSessionThresholdPercent(normalized));
  };

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

      <SettingRow
        label={t("settings.general.autoGenerateTitlesLabel")}
        description={t("settings.general.autoGenerateTitlesDescription")}
        control={
          <Switch
            checked={autoGenerateTitles}
            onCheckedChange={handleAutoGenerateTitlesChange}
            aria-label={t("settings.general.autoGenerateTitlesAriaLabel")}
          />
        }
      />

      <SettingRow
        label={t("settings.general.contextSessionThresholdLabel")}
        description={t("settings.general.contextSessionThresholdDescription")}
        control={
          <InputGroup className="w-28">
            <InputGroupInput
              type="number"
              min={minPercent}
              max={maxPercent}
              step={1}
              value={sessionThresholdInput}
              onChange={(event) => setSessionThresholdInput(event.target.value)}
              onBlur={(event) => commitSessionThreshold(event.target.value)}
              aria-label={t("settings.general.contextSessionThresholdAriaLabel")}
              inputMode="numeric"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>%</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        }
      />
    </section>
  );
}
