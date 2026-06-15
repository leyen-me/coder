import {
  Bot,
  Database,
  FlaskConical,
  Globe,
  Info,
  Keyboard,
  Mail,
  Palette,
  SlidersHorizontal,
} from "lucide-react";

import type { SettingsCategoryId } from "./types";

export type SettingsCategory = {
  id: SettingsCategoryId;
  icon: typeof SlidersHorizontal;
};

export type SettingsCategoryGroup = {
  nameKey: string;
  items: SettingsCategory[];
};

export const SETTINGS_CATEGORY_GROUPS: SettingsCategoryGroup[] = [
  {
    nameKey: "settings.groups.general",
    items: [
      { id: "general", icon: SlidersHorizontal },
      { id: "appearance", icon: Palette },
      { id: "keyboardShortcuts", icon: Keyboard },
    ],
  },
  {
    nameKey: "settings.groups.services",
    items: [
      { id: "modelProvider", icon: Bot },
      { id: "email", icon: Mail },
      { id: "webTools", icon: Globe },
    ],
  },
  {
    nameKey: "settings.groups.system",
    items: [
      { id: "data", icon: Database },
      { id: "lab", icon: FlaskConical },
      { id: "about", icon: Info },
    ],
  },
];

/** Flat list for backward compatibility (legacy usage). */
export const SETTINGS_CATEGORIES: SettingsCategory[] =
  SETTINGS_CATEGORY_GROUPS.flatMap((group) => group.items);

export const DEFAULT_SETTINGS_CATEGORY: SettingsCategoryId = "general";
