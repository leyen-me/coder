import { getKVStore } from "@/lib/storage";
import { DEFAULT_THEME_PREFERENCE, THEME_STORAGE_KEY } from "./constants";
import { parseThemePreference } from "./parse-theme-preference";
import type { ThemePreference } from "./types";

export function readThemePreference(): ThemePreference {
  try {
    return parseThemePreference(getKVStore().getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

export function writeThemePreference(preference: ThemePreference): void {
  getKVStore().setItem(THEME_STORAGE_KEY, preference);
}
