import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY } from "./constants";
import { parseLocale } from "./parse-locale";
import type { Locale } from "./types";

export function readLocale(): Locale {
  if (typeof localStorage === "undefined") {
    return DEFAULT_LOCALE;
  }

  try {
    return parseLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function writeLocale(locale: Locale): void {
  localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}
