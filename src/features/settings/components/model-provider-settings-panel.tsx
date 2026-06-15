import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Switch } from "@/components/ui/switch";
import {
  PROVIDER_IDS,
  usesUserManagedModels,
} from "@/lib/model-provider/constants";
import { useModelProvider } from "@/lib/model-provider/model-provider-provider";
import { useLocale } from "@/lib/i18n/locale-provider";

import { CustomModelsEditor } from "./custom-models-editor";
import { PresetModelsList } from "./preset-models-list";
import { SettingField } from "./setting-field";
import { SettingRow } from "./setting-row";
import { SettingSelect } from "./setting-select";

export function ModelProviderSettingsPanel() {
  const { t } = useLocale();
  const {
    activeProvider,
    activeProviderSettings,
    resolved,
    setActiveProvider,
    updateActiveProviderSettings,
  } = useModelProvider();

  const isCustom = activeProvider === "custom";
  const usesCustomModels = usesUserManagedModels(activeProvider);

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

  return (
    <section className="divide-y">
      <SettingRow
        label={t("settings.modelProvider.providerLabel")}
        description={t("settings.modelProvider.providerDescription")}
        control={
          <SettingSelect
            value={activeProvider}
            options={providerOptions}
            onValueChange={setActiveProvider}
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
            value={activeProviderSettings.customBaseUrl}
            onChange={(event) =>
              updateActiveProviderSettings({
                customBaseUrl: event.target.value,
              })
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
            value={activeProviderSettings.apiKeySource}
            options={apiKeySourceOptions}
            onValueChange={(apiKeySource) =>
              updateActiveProviderSettings({ apiKeySource })
            }
            aria-label={t("settings.modelProvider.apiKeySourceAriaLabel")}
          />
        }
      />

      {activeProviderSettings.apiKeySource === "manual" ? (
        <SettingField
          label={t("settings.modelProvider.apiKeyLabel")}
          description={t("settings.modelProvider.apiKeyDescription")}
        >
          <PasswordInput
            value={activeProviderSettings.apiKey}
            onChange={(event) =>
              updateActiveProviderSettings({ apiKey: event.target.value })
            }
            placeholder={t("settings.modelProvider.apiKeyPlaceholder")}
            aria-label={t("settings.modelProvider.apiKeyAriaLabel")}
            showPasswordLabel={t("settings.modelProvider.apiKeyShowAriaLabel")}
            hidePasswordLabel={t("settings.modelProvider.apiKeyHideAriaLabel")}
            autoComplete="off"
          />
        </SettingField>
      ) : (
        <SettingField
          label={t("settings.modelProvider.apiKeyEnvVarLabel")}
          description={t("settings.modelProvider.apiKeyEnvVarDescription")}
        >
          <Input
            value={activeProviderSettings.apiKeyEnvVar}
            onChange={(event) =>
              updateActiveProviderSettings({
                apiKeyEnvVar: event.target.value,
              })
            }
            placeholder={t("settings.modelProvider.apiKeyEnvVarPlaceholder")}
            aria-label={t("settings.modelProvider.apiKeyEnvVarAriaLabel")}
            className="font-mono text-sm"
          />
        </SettingField>
      )}

      {usesCustomModels ? (
        <SettingField
          label={t("settings.modelProvider.modelsLabel")}
          description={t("settings.modelProvider.modelsDescription")}
        >
          <CustomModelsEditor
            models={activeProviderSettings.customModels}
            provider={activeProvider}
            onChange={(customModels) =>
              updateActiveProviderSettings({ customModels })
            }
          />
        </SettingField>
      ) : (
        <SettingField
          label={t("settings.modelProvider.modelsLabel")}
          description={t("settings.modelProvider.presetModelsDescription")}
        >
          <PresetModelsList models={resolved.models} />
        </SettingField>
      )}

      {activeProvider === "deepseek" && (
        <SettingRow
          label={t("settings.modelProvider.showUsageLabel")}
          description={t("settings.modelProvider.showUsageDescription")}
          control={
            <Switch
              checked={activeProviderSettings.showUsage}
              onCheckedChange={(checked) => {
                updateActiveProviderSettings({ showUsage: checked });
              }}
              aria-label={t("settings.modelProvider.showUsageAriaLabel")}
            />
          }
        />
      )}
    </section>
  );
}
