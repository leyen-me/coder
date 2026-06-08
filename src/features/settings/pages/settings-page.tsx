import { useState, type ComponentType } from "react";
import { useOutletContext } from "react-router-dom";

import type { ShellOutletContext } from "@/app/shell-outlet-context";
import { MainColumn } from "@/components/layout/main-column";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { DEFAULT_SETTINGS_CATEGORY } from "../constants";
import { AppearanceSettingsPanel } from "../components/appearance-settings-panel";
import { DataSettingsPanel } from "../components/data-settings-panel";
import { GeneralSettingsPanel } from "../components/general-settings-panel";
import { ModelProviderSettingsPanel } from "../components/model-provider-settings-panel";
import { SettingsSidebar } from "../components/settings-sidebar";
import type { SettingsCategoryId } from "../types";

const SETTINGS_PANELS: Record<SettingsCategoryId, ComponentType> = {
  general: GeneralSettingsPanel,
  appearance: AppearanceSettingsPanel,
  modelProvider: ModelProviderSettingsPanel,
  data: DataSettingsPanel,
};

export function SettingsPage() {
  const { sidebarOpen } = useOutletContext<ShellOutletContext>();
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] =
    useState<SettingsCategoryId>(DEFAULT_SETTINGS_CATEGORY);

  const Panel = SETTINGS_PANELS[selectedCategory];

  return (
    <>
      <SettingsSidebar
        open={sidebarOpen}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
      />

      <MainColumn
        titleBarLeading={
          <h1 className="truncate text-sm font-medium">
            {t(`settings.categories.${selectedCategory}`)}
          </h1>
        }
      >
        <div className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="mx-auto w-full max-w-2xl px-6 py-2">
              <Panel />
            </div>
          </ScrollArea>
        </div>
      </MainColumn>
    </>
  );
}
