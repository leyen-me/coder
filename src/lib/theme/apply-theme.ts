import type { ResolvedTheme } from "./types";

export function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;

  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}
