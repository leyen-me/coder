import { Palette, SlidersHorizontal } from "lucide-react";

import type { SettingsCategoryId } from "./types";

export type SettingsCategory = {
  id: SettingsCategoryId;
  label: string;
  icon: typeof SlidersHorizontal;
};

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  { id: "general", label: "常规", icon: SlidersHorizontal },
  { id: "appearance", label: "外观", icon: Palette },
];

export const DEFAULT_SETTINGS_CATEGORY: SettingsCategoryId = "general";

export const LANGUAGE_OPTIONS = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
] as const;

export const DEFAULT_LANGUAGE = "zh" as const;
