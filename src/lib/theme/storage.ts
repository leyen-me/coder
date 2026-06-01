import { DEFAULT_THEME_PREFERENCE, THEME_STORAGE_KEY } from "./constants";
import { parseThemePreference } from "./parse-theme-preference";
import type { ThemePreference } from "./types";

export function readThemePreference(): ThemePreference {
  if (typeof localStorage === "undefined") {
    return DEFAULT_THEME_PREFERENCE;
  }

  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

export function writeThemePreference(preference: ThemePreference): void {
  localStorage.setItem(THEME_STORAGE_KEY, preference);
}
