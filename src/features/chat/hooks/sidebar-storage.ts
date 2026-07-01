export const SIDEBAR_STORAGE_KEY = "sidebar_open";

export function readSidebarOpen(defaultValue = true): boolean {
  if (typeof localStorage === "undefined") {
    return defaultValue;
  }

  try {
    const raw = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (raw === null) {
      return defaultValue;
    }
    return raw === "true";
  } catch {
    return defaultValue;
  }
}

export function writeSidebarOpen(open: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(open));
  } catch {
    // localStorage may be unavailable (e.g. private browsing in some browsers)
  }
}
