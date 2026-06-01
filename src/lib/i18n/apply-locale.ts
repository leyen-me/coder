import type { Locale } from "./types";

export function applyLocale(locale: Locale): void {
  document.documentElement.lang = locale;
}
