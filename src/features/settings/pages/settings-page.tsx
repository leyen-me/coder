import { useState, type ComponentType } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";

import { DEFAULT_SETTINGS_CATEGORY } from "../constants";
import { AppearanceSettingsPanel } from "../components/appearance-settings-panel";
import { GeneralSettingsPanel } from "../components/general-settings-panel";
import { SettingsSidebar } from "../components/settings-sidebar";
import type { SettingsCategoryId } from "../types";

const SETTINGS_PANELS: Record<SettingsCategoryId, ComponentType> = {
  general: GeneralSettingsPanel,
  appearance: AppearanceSettingsPanel,
};

const SETTINGS_TITLES: Record<SettingsCategoryId, string> = {
  general: "常规",
  appearance: "外观",
};

type SettingsPageProps = {
  sidebarOpen: boolean;
};

export function SettingsPage({ sidebarOpen }: SettingsPageProps) {
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

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center border-b px-6">
          <h1 className="text-sm font-medium">
            {SETTINGS_TITLES[selectedCategory]}
          </h1>
        </header>

        <ScrollArea className="flex-1">
          <div className="mx-auto w-full max-w-2xl px-6 py-2">
            <Panel />
          </div>
        </ScrollArea>
      </div>
    </>
  );
}
