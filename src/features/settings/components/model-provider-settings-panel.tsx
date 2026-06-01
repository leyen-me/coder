import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PRESET_PROVIDERS, PROVIDER_IDS } from "@/lib/model-provider/constants";
import {
  formatModelsText,
  parseModelsText,
} from "@/lib/model-provider/parse-models-text";
import { useModelProvider } from "@/lib/model-provider/model-provider-provider";
import type { ProviderId } from "@/lib/model-provider/types";
import { useLocale } from "@/lib/i18n/locale-provider";

import { SettingField } from "./setting-field";
import { SettingRow } from "./setting-row";
import { SettingSelect } from "./setting-select";

function getDefaultApiKeyEnvVar(provider: ProviderId): string {
  if (provider === "custom") {
    return "OPENAI_API_KEY";
  }

  return PRESET_PROVIDERS[provider].defaultApiKeyEnvVar;
}

export function ModelProviderSettingsPanel() {
  const { t } = useLocale();
  const { settings, resolved, updateSettings } = useModelProvider();

  const isCustom = settings.provider === "custom";

  const providerOptions = PROVIDER_IDS.map((value) => ({
    value,
    label: t(`settings.modelProvider.providers.${value}`),
  }));

  const apiKeySourceOptions = (
    ["manual", "env"] as const
  ).map((value) => ({
    value,
    label: t(`settings.modelProvider.apiKeySources.${value}`),
  }));

  const handleProviderChange = (provider: ProviderId) => {
    updateSettings({
      provider,
      apiKeyEnvVar:
        settings.apiKeyEnvVar.trim().length === 0 ||
        settings.apiKeyEnvVar === getDefaultApiKeyEnvVar(settings.provider)
          ? getDefaultApiKeyEnvVar(provider)
          : settings.apiKeyEnvVar,
    });
  };

  return (
    <section className="divide-y">
      <SettingRow
        label={t("settings.modelProvider.providerLabel")}
        description={t("settings.modelProvider.providerDescription")}
        control={
          <SettingSelect
            value={settings.provider}
            options={providerOptions}
            onValueChange={handleProviderChange}
            aria-label={t("settings.modelProvider.providerAriaLabel")}
          />
        }
      />

      {isCustom ? (
        <SettingField
          label={t("settings.modelProvider.baseUrlLabel")}
          description={t("settings.modelProvider.baseUrlDescription")}
        >
          <Input
            value={settings.customBaseUrl}
            onChange={(event) =>
              updateSettings({ customBaseUrl: event.target.value })
            }
            placeholder={t("settings.modelProvider.baseUrlPlaceholder")}
            aria-label={t("settings.modelProvider.baseUrlAriaLabel")}
            className="font-mono text-sm"
          />
        </SettingField>
      ) : (
        <SettingField
          label={t("settings.modelProvider.endpointLabel")}
          description={t("settings.modelProvider.endpointDescription")}
        >
          <p className="rounded-lg border border-input bg-muted/30 px-2.5 py-2 font-mono text-sm text-muted-foreground">
            {resolved.baseUrl}
          </p>
        </SettingField>
      )}

      <SettingRow
        label={t("settings.modelProvider.apiKeySourceLabel")}
        description={t("settings.modelProvider.apiKeySourceDescription")}
        control={
          <SettingSelect
            value={settings.apiKeySource}
            options={apiKeySourceOptions}
            onValueChange={(apiKeySource) => updateSettings({ apiKeySource })}
            aria-label={t("settings.modelProvider.apiKeySourceAriaLabel")}
          />
        }
      />

      {settings.apiKeySource === "manual" ? (
        <SettingField
          label={t("settings.modelProvider.apiKeyLabel")}
          description={t("settings.modelProvider.apiKeyDescription")}
        >
          <Input
            type="password"
            value={settings.apiKey}
            onChange={(event) => updateSettings({ apiKey: event.target.value })}
            placeholder={t("settings.modelProvider.apiKeyPlaceholder")}
            aria-label={t("settings.modelProvider.apiKeyAriaLabel")}
            autoComplete="off"
          />
        </SettingField>
      ) : (
        <SettingField
          label={t("settings.modelProvider.apiKeyEnvVarLabel")}
          description={t("settings.modelProvider.apiKeyEnvVarDescription")}
        >
          <Input
            value={settings.apiKeyEnvVar}
            onChange={(event) =>
              updateSettings({ apiKeyEnvVar: event.target.value })
            }
            placeholder={t("settings.modelProvider.apiKeyEnvVarPlaceholder")}
            aria-label={t("settings.modelProvider.apiKeyEnvVarAriaLabel")}
            className="font-mono text-sm"
          />
        </SettingField>
      )}

      {isCustom ? (
        <SettingField
          label={t("settings.modelProvider.modelsLabel")}
          description={t("settings.modelProvider.modelsDescription")}
        >
          <Textarea
            value={formatModelsText(settings.customModels)}
            onChange={(event) =>
              updateSettings({
                customModels: parseModelsText(event.target.value),
              })
            }
            placeholder={t("settings.modelProvider.modelsPlaceholder")}
            aria-label={t("settings.modelProvider.modelsAriaLabel")}
            className="min-h-28 font-mono text-sm"
          />
        </SettingField>
      ) : (
        <SettingField
          label={t("settings.modelProvider.modelsLabel")}
          description={t("settings.modelProvider.presetModelsDescription")}
        >
          <ul className="space-y-1 rounded-lg border border-input bg-muted/30 px-2.5 py-2">
            {resolved.models.map((model) => (
              <li key={model} className="font-mono text-sm text-muted-foreground">
                {model}
              </li>
            ))}
          </ul>
        </SettingField>
      )}
    </section>
  );
}
