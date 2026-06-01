import { Palette, SlidersHorizontal } from "lucide-react";

import type { SettingsCategoryId } from "./types";

export type SettingsCategory = {
  id: SettingsCategoryId;
  icon: typeof SlidersHorizontal;
};

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  { id: "general", icon: SlidersHorizontal },
  { id: "appearance", icon: Palette },
];

export const DEFAULT_SETTINGS_CATEGORY: SettingsCategoryId = "general";
