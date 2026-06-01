import { DEFAULT_THEME_PREFERENCE } from "./constants";
import type { ThemePreference } from "./types";

export function parseThemePreference(value: unknown): ThemePreference {
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }

  return DEFAULT_THEME_PREFERENCE;
}
