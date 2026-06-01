import type { ThemePreference } from "./types";

export const THEME_STORAGE_KEY = "coder:theme-preference";

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "light";

export const THEME_PREFERENCE_OPTIONS = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
] as const satisfies ReadonlyArray<{
  value: ThemePreference;
  label: string;
}>;
