import { useState, type ComponentType } from "react";
import { useOutletContext } from "react-router-dom";

import type { ShellOutletContext } from "@/app/shell-outlet-context";
import { MainColumn } from "@/components/layout/main-column";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { DEFAULT_SETTINGS_CATEGORY } from "../constants";
import { AppearanceSettingsPanel } from "../components/appearance-settings-panel";
import { DataSettingsPanel } from "../components/data-settings-panel";
import { EmailSettingsPanel } from "../components/email-settings-panel";
import { GeneralSettingsPanel } from "../components/general-settings-panel";
import { KeyboardShortcutsSettingsPanel } from "../components/keyboard-shortcuts-settings-panel";
import { ModelProviderSettingsPanel } from "../components/model-provider-settings-panel";
import { LabSettingsPanel } from "../components/lab-settings-panel";
import { WebToolsSettingsPanel } from "../components/web-tools-settings-panel";
import { RemoteTargetsSettingsPanel } from "../components/remote-targets-settings-panel";
import { SettingsSidebar } from "../components/settings-sidebar";
import type { SettingsCategoryId } from "../types";

const SETTINGS_PANELS: Record<SettingsCategoryId, ComponentType> = {
  general: GeneralSettingsPanel,
  appearance: AppearanceSettingsPanel,
  keyboardShortcuts: KeyboardShortcutsSettingsPanel,
  modelProvider: ModelProviderSettingsPanel,
  webTools: WebToolsSettingsPanel,
  data: DataSettingsPanel,
  lab: LabSettingsPanel,
  email: EmailSettingsPanel,
  remoteTargets: RemoteTargetsSettingsPanel,
};

export function SettingsPage() {
  const { sidebarOpen, setSidebarOpen } = useOutletContext<ShellOutletContext>();
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] =
    useState<SettingsCategoryId>(DEFAULT_SETTINGS_CATEGORY);

  const handleSelectCategory = (category: SettingsCategoryId) => {
    setSelectedCategory(category);
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const Panel = SETTINGS_PANELS[selectedCategory];

  return (
    <>
      <SettingsSidebar
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        selectedCategory={selectedCategory}
        onSelectCategory={handleSelectCategory}
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
            <div className="mx-auto w-full max-w-2xl px-4 py-4 md:px-6 md:py-6">
              <Panel />
            </div>
          </ScrollArea>
        </div>
      </MainColumn>
    </>
  );
}
