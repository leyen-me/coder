import type { Locale } from "./types";

export const LOCALE_STORAGE_KEY = "coder:locale";

export const DEFAULT_LOCALE: Locale = "zh";

export const LOCALE_VALUES = ["zh", "en"] as const satisfies readonly Locale[];
