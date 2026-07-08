import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_TAVILY_API_KEY_ENV_VAR } from "@/lib/web-tools/constants";
import { useWebTools } from "@/lib/web-tools/web-tools-provider";
import { useLocale } from "@/lib/i18n/locale-provider";

import { SettingField } from "./setting-field";
import { SettingRow } from "./setting-row";
import { SettingSelect } from "./setting-select";

export function WebToolsSettingsPanel() {
  const { t } = useLocale();
  const { settings, updateSettings } = useWebTools();

  const apiKeySourceOptions = (["manual", "env"] as const).map((value) => ({
    value,
    label: t(`settings.webTools.apiKeySources.${value}`),
  }));

  const webSearchProviderOptions = (["tavily", "searxng"] as const).map(
    (value) => ({
      value,
      label: t(`settings.webTools.webSearchProviders.${value}`),
    })
  );

  return (
    <section className="divide-y">
      <SettingRow
        label={t("settings.webTools.webSearchProviderLabel")}
        description={t("settings.webTools.webSearchProviderDescription")}
        control={
          <SettingSelect
            value={settings.webSearchProvider}
            options={webSearchProviderOptions}
            onValueChange={(value) =>
              updateSettings({
                webSearchProvider: value,
              })
            }
            aria-label={t("settings.webTools.webSearchProviderAriaLabel")}
          />
        }
      />

      {settings.webSearchProvider === "tavily" ? (
        <>
          <SettingRow
            label={t("settings.webTools.tavilyApiKeySourceLabel")}
            description={t("settings.webTools.tavilyApiKeySourceDescription")}
            control={
              <SettingSelect
                value={settings.tavilyApiKeySource}
                options={apiKeySourceOptions}
                onValueChange={(value) =>
                  updateSettings({
                    tavilyApiKeySource: value,
                    tavilyApiKeyEnvVar:
                      settings.tavilyApiKeyEnvVar.trim().length === 0
                        ? DEFAULT_TAVILY_API_KEY_ENV_VAR
                        : settings.tavilyApiKeyEnvVar,
                  })
                }
                aria-label={t("settings.webTools.tavilyApiKeySourceAriaLabel")}
              />
            }
          />

          {settings.tavilyApiKeySource === "manual" ? (
            <SettingField
              label={t("settings.webTools.tavilyApiKeyLabel")}
              description={t("settings.webTools.tavilyApiKeyDescription")}
            >
              <Input
                type="password"
                value={settings.tavilyApiKey}
                onChange={(event) =>
                  updateSettings({ tavilyApiKey: event.target.value })
                }
                placeholder={t("settings.webTools.tavilyApiKeyPlaceholder")}
                aria-label={t("settings.webTools.tavilyApiKeyAriaLabel")}
                autoComplete="off"
              />
            </SettingField>
          ) : (
            <SettingField
              label={t("settings.webTools.tavilyApiKeyEnvVarLabel")}
              description={t("settings.webTools.tavilyApiKeyEnvVarDescription")}
            >
              <Input
                value={settings.tavilyApiKeyEnvVar}
                onChange={(event) =>
                  updateSettings({ tavilyApiKeyEnvVar: event.target.value })
                }
                placeholder={t("settings.webTools.tavilyApiKeyEnvVarPlaceholder")}
                aria-label={t("settings.webTools.tavilyApiKeyEnvVarAriaLabel")}
                className="font-mono text-sm"
              />
            </SettingField>
          )}
        </>
      ) : (
        <SettingField
          label={t("settings.webTools.searxngBaseUrlLabel")}
          description={t("settings.webTools.searxngBaseUrlDescription")}
        >
          <Input
            value={settings.searxngBaseUrl}
            onChange={(event) =>
              updateSettings({ searxngBaseUrl: event.target.value })
            }
            placeholder={t("settings.webTools.searxngBaseUrlPlaceholder")}
            aria-label={t("settings.webTools.searxngBaseUrlAriaLabel")}
            className="font-mono text-sm"
          />
        </SettingField>
      )}

      <SettingRow
        label={t("settings.webTools.allowPrivateNetworkAccessLabel")}
        description={t("settings.webTools.allowPrivateNetworkAccessDescription")}
        control={
          <Switch
            checked={settings.allowPrivateNetworkAccess}
            onCheckedChange={(checked) =>
              updateSettings({ allowPrivateNetworkAccess: checked })
            }
            aria-label={t("settings.webTools.allowPrivateNetworkAccessAriaLabel")}
          />
        }
      />
    </section>
  );
}
