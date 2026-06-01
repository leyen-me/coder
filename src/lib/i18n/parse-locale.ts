import { DEFAULT_LOCALE } from "./constants";
import type { Locale } from "./types";

export function parseLocale(value: unknown): Locale {
  if (value === "zh" || value === "en") {
    return value;
  }

  return DEFAULT_LOCALE;
}
