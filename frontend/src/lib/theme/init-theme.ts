import { applyTheme } from "./apply-theme";
import { getSystemPrefersDark } from "./get-system-prefers-dark";
import { readThemePreference } from "./storage";
import { resolveTheme } from "./resolve-theme";

/** Applies persisted theme before React mounts to avoid a flash of wrong colors. */
export function initThemeBeforeRender(): void {
  if (typeof document === "undefined") {
    return;
  }

  const preference = readThemePreference();
  applyTheme(resolveTheme(preference, getSystemPrefersDark()));
}
