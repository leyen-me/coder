import { applyLocale } from "./apply-locale";
import { readLocale } from "./storage";

/** Applies persisted locale before React mounts. */
export function initLocaleBeforeRender(): void {
  if (typeof document === "undefined") {
    return;
  }

  applyLocale(readLocale());
}
