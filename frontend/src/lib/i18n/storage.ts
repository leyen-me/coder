import { getKVStore } from "@/lib/storage";
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY } from "./constants";
import { parseLocale } from "./parse-locale";
import type { Locale } from "./types";

export function readLocale(): Locale {
  try {
    return parseLocale(getKVStore().getItem(LOCALE_STORAGE_KEY));
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function writeLocale(locale: Locale): void {
  getKVStore().setItem(LOCALE_STORAGE_KEY, locale);
}
