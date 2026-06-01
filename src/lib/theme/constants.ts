import type { ThemePreference } from "./types";

export const THEME_STORAGE_KEY = "coder:theme-preference";

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "light";

export const THEME_PREFERENCE_VALUES = [
  "light",
  "dark",
  "system",
] as const satisfies readonly ThemePreference[];
