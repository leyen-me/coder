import {
  Bot,
  Database,
  FlaskConical,
  Globe,
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

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  { id: "general", icon: SlidersHorizontal },
  { id: "appearance", icon: Palette },
  { id: "keyboardShortcuts", icon: Keyboard },
  { id: "modelProvider", icon: Bot },
  { id: "webTools", icon: Globe },
  { id: "data", icon: Database },
  { id: "lab", icon: FlaskConical },
  { id: "email", icon: Mail },
];

export const DEFAULT_SETTINGS_CATEGORY: SettingsCategoryId = "general";
