import { useState } from "react";

import {
  formatAgentHandoffThresholdPercent,
  MAX_AGENT_HANDOFF_THRESHOLD,
  MIN_AGENT_HANDOFF_THRESHOLD,
  readAgentHandoffThreshold,
  writeAgentHandoffThreshold,
  normalizeAgentHandoffThreshold,
} from "@/features/agent/handoff-settings";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { LOCALE_VALUES } from "@/lib/i18n/constants";
import { useLocale } from "@/lib/i18n/locale-provider";

import { SettingRow } from "./setting-row";
import { SettingSelect } from "./setting-select";

export function GeneralSettingsPanel() {
  const { locale, setLocale, t } = useLocale();
  const [handoffThresholdInput, setHandoffThresholdInput] = useState(() =>
    formatAgentHandoffThresholdPercent(readAgentHandoffThreshold())
  );

  const localeOptions = LOCALE_VALUES.map((value) => ({
    value,
    label: t(`locale.${value}`),
  }));

  const minPercent = MIN_AGENT_HANDOFF_THRESHOLD * 100;
  const maxPercent = MAX_AGENT_HANDOFF_THRESHOLD * 100;

  const commitHandoffThreshold = (raw: string) => {
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) {
      setHandoffThresholdInput(
        formatAgentHandoffThresholdPercent(readAgentHandoffThreshold())
      );
      return;
    }

    const normalized = normalizeAgentHandoffThreshold(parsed / 100);
    writeAgentHandoffThreshold(normalized);
    setHandoffThresholdInput(formatAgentHandoffThresholdPercent(normalized));
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
        label={t("settings.general.contextHandoffThresholdLabel")}
        description={t("settings.general.contextHandoffThresholdDescription")}
        control={
          <InputGroup className="w-28">
            <InputGroupInput
              type="number"
              min={minPercent}
              max={maxPercent}
              step={1}
              value={handoffThresholdInput}
              onChange={(event) => setHandoffThresholdInput(event.target.value)}
              onBlur={(event) => commitHandoffThreshold(event.target.value)}
              aria-label={t("settings.general.contextHandoffThresholdAriaLabel")}
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
