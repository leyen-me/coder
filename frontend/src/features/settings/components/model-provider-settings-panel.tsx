import { useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PROVIDER_IDS,
  usesUserManagedModels,
} from "@/lib/model-provider/constants";
import { resolveProviderConfig } from "@/lib/model-provider/resolve-provider-config";
import { useModelProvider } from "@/lib/model-provider/model-provider-provider";
import { useLocale } from "@/lib/i18n/locale-provider";
import type { ProviderId } from "@/lib/model-provider/types";

import { CustomModelsEditor } from "./custom-models-editor";
import { PresetModelsList } from "./preset-models-list";
import { SettingField } from "./setting-field";
import { SettingRow } from "./setting-row";
import { SettingSelect } from "./setting-select";

function ProviderConfigCard({ providerId }: { providerId: ProviderId }) {
  const { t } = useLocale();
  const {
    settings,
    updateProviderSettings,
    setProviderEnabled,
  } = useModelProvider();

  const providerSettings = settings.providers[providerId];
  const isEnabled = settings.enabledProviders.includes(providerId);
  const usesCustomModels = usesUserManagedModels(providerId);
  const resolved = resolveProviderConfig(settings, providerId);

  const apiKeySourceOptions = (
    ["manual", "env"] as const
  ).map((value) => ({
    value,
    label: t(`settings.modelProvider.apiKeySources.${value}`),
  }));

  return (
    <div className="rounded-lg border bg-card p-4">
      {/* Header row: enable switch + provider name */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            checked={isEnabled}
            onCheckedChange={(checked) => {
              setProviderEnabled(providerId, checked);
            }}
            aria-label={`Enable ${t(`settings.modelProvider.providers.${providerId}`)}`}
          />
          <h3 className="text-sm font-medium">
            {t(`settings.modelProvider.providers.${providerId}`)}
          </h3>
        </div>
      </div>

      {isEnabled && (
        <div className="space-y-4">
          {/* Base URL / Endpoint (preset providers use a fixed endpoint) */}
          <SettingField
            label={t("settings.modelProvider.endpointLabel")}
            description={t("settings.modelProvider.endpointDescription")}
          >
            <p className="rounded-lg border border-input bg-muted/30 px-2.5 py-2 font-mono text-sm text-muted-foreground">
              {resolved.baseUrl}
            </p>
          </SettingField>

          {/* API Key Source */}
          <SettingRow
            label={t("settings.modelProvider.apiKeySourceLabel")}
            description={t("settings.modelProvider.apiKeySourceDescription")}
            control={
              <SettingSelect
                value={providerSettings.apiKeySource}
                options={apiKeySourceOptions}
                onValueChange={(apiKeySource) =>
                  updateProviderSettings(providerId, { apiKeySource } as Partial<typeof providerSettings>)
                }
                aria-label={t("settings.modelProvider.apiKeySourceAriaLabel")}
              />
            }
          />

          {/* API Key or Env Var */}
          {providerSettings.apiKeySource === "manual" ? (
            <SettingField
              label={t("settings.modelProvider.apiKeyLabel")}
              description={t("settings.modelProvider.apiKeyDescription")}
            >
              <PasswordInput
                value={providerSettings.apiKey}
                onChange={(event) =>
                  updateProviderSettings(providerId, {
                    apiKey: event.target.value,
                  })
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
                value={providerSettings.apiKeyEnvVar}
                onChange={(event) =>
                  updateProviderSettings(providerId, {
                    apiKeyEnvVar: event.target.value,
                  })
                }
                placeholder={t("settings.modelProvider.apiKeyEnvVarPlaceholder")}
                aria-label={t("settings.modelProvider.apiKeyEnvVarAriaLabel")}
                className="font-mono text-sm"
              />
            </SettingField>
          )}

          {/* Models */}
          {usesCustomModels ? (
            <SettingField
              label={t("settings.modelProvider.modelsLabel")}
              description={t("settings.modelProvider.modelsDescription")}
            >
              <CustomModelsEditor
                models={providerSettings.customModels}
                provider={providerId}
                onChange={(customModels) =>
                  updateProviderSettings(providerId, { customModels })
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

          {/* Show Usage (DeepSeek only) */}
          {providerId === "deepseek" && (
            <SettingRow
              label={t("settings.modelProvider.showUsageLabel")}
              description={t("settings.modelProvider.showUsageDescription")}
              control={
                <Switch
                  checked={providerSettings.showUsage}
                  onCheckedChange={(checked) => {
                    updateProviderSettings(providerId, { showUsage: checked });
                  }}
                  aria-label={t("settings.modelProvider.showUsageAriaLabel")}
                />
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

function CustomProviderConfigCard({ providerId }: { providerId: string }) {
  const { t } = useLocale();
  const {
    settings,
    updateCustomProvider,
    setProviderEnabled,
    removeCustomProvider,
  } = useModelProvider();

  const custom = settings.customProviders[providerId];
  const isEnabled = settings.enabledProviders.includes(providerId);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!custom) {
    return null;
  }

  const apiKeySourceOptions = (
    ["manual", "env"] as const
  ).map((value) => ({
    value,
    label: t(`settings.modelProvider.apiKeySources.${value}`),
  }));

  return (
    <div className="rounded-lg border bg-card p-4">
      {/* Header row: enable switch + name + delete */}
      <div className="mb-4 flex items-center gap-2">
        <Switch
          checked={isEnabled}
          onCheckedChange={(checked) => {
            setProviderEnabled(providerId, checked);
          }}
          aria-label={`Enable ${custom.name || t("settings.modelProvider.customProviderDefaultName")}`}
        />
        <Input
          value={custom.name}
          onChange={(event) =>
            updateCustomProvider(providerId, { name: event.target.value })
          }
          placeholder={t("settings.modelProvider.customProviderNamePlaceholder")}
          aria-label={t("settings.modelProvider.customProviderNameAriaLabel")}
          className="h-8 flex-1 font-medium"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setConfirmOpen(true)}
          aria-label={t("settings.modelProvider.removeProviderAriaLabel")}
          className="shrink-0 text-muted-foreground hover:text-destructive"
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>

      {isEnabled && (
        <div className="space-y-4">
          {/* Base URL */}
          <SettingField
            label={t("settings.modelProvider.baseUrlLabel")}
            description={t("settings.modelProvider.baseUrlDescription")}
          >
            <Input
              value={custom.baseUrl}
              onChange={(event) =>
                updateCustomProvider(providerId, {
                  baseUrl: event.target.value,
                })
              }
              placeholder={t("settings.modelProvider.baseUrlPlaceholder")}
              aria-label={t("settings.modelProvider.baseUrlAriaLabel")}
              className="font-mono text-sm"
            />
          </SettingField>

          {/* API Key Source */}
          <SettingRow
            label={t("settings.modelProvider.apiKeySourceLabel")}
            description={t("settings.modelProvider.apiKeySourceDescription")}
            control={
              <SettingSelect
                value={custom.apiKeySource}
                options={apiKeySourceOptions}
                onValueChange={(apiKeySource) =>
                  updateCustomProvider(providerId, { apiKeySource })
                }
                aria-label={t("settings.modelProvider.apiKeySourceAriaLabel")}
              />
            }
          />

          {/* API Key or Env Var */}
          {custom.apiKeySource === "manual" ? (
            <SettingField
              label={t("settings.modelProvider.apiKeyLabel")}
              description={t("settings.modelProvider.apiKeyDescription")}
            >
              <PasswordInput
                value={custom.apiKey}
                onChange={(event) =>
                  updateCustomProvider(providerId, {
                    apiKey: event.target.value,
                  })
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
                value={custom.apiKeyEnvVar}
                onChange={(event) =>
                  updateCustomProvider(providerId, {
                    apiKeyEnvVar: event.target.value,
                  })
                }
                placeholder={t("settings.modelProvider.apiKeyEnvVarPlaceholder")}
                aria-label={t("settings.modelProvider.apiKeyEnvVarAriaLabel")}
                className="font-mono text-sm"
              />
            </SettingField>
          )}

          {/* Models */}
          <SettingField
            label={t("settings.modelProvider.modelsLabel")}
            description={t("settings.modelProvider.modelsDescription")}
          >
            <CustomModelsEditor
              models={custom.models}
              provider={providerId}
              onChange={(models) =>
                updateCustomProvider(providerId, { models })
              }
            />
          </SettingField>
        </div>
      )}

      <Dialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("settings.modelProvider.confirmRemoveProviderTitle")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("settings.modelProvider.confirmRemoveProviderDescription", {
              name: custom.name || t("settings.modelProvider.customProviderDefaultName"),
            })}
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
            >
              {t("settings.modelProvider.confirmCancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false);
                removeCustomProvider(providerId);
              }}
            >
              {t("settings.modelProvider.confirmRemoveProviderAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ModelProviderSettingsPanel() {
  const { t } = useLocale();
  const { settings, addCustomProvider } = useModelProvider();

  const customProviders = Object.values(settings.customProviders);

  return (
    <section className="space-y-4">
      {PROVIDER_IDS.map((providerId, index) => (
        <div key={providerId}>
          {index > 0 && <Separator className="my-4" />}
          <ProviderConfigCard providerId={providerId} />
        </div>
      ))}

      {customProviders.length > 0 && <Separator className="my-4" />}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">
            {t("settings.modelProvider.customProvidersSectionTitle")}
          </h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addCustomProvider()}
          >
            <PlusIcon className="size-4" />
            {t("settings.modelProvider.addProviderButton")}
          </Button>
        </div>

        {customProviders.map((custom) => (
          <CustomProviderConfigCard key={custom.id} providerId={custom.id} />
        ))}
      </div>
    </section>
  );
}
