import {
  DEFAULT_WEB_TOOLS_SETTINGS,
  WEB_TOOLS_STORAGE_KEY,
} from "./constants";
import { parseWebToolsSettings } from "./parse-web-tools-settings";
import type { WebToolsSettings } from "./types";

export function readWebToolsSettings(): WebToolsSettings {
  if (typeof localStorage === "undefined") {
    return DEFAULT_WEB_TOOLS_SETTINGS;
  }

  try {
    const raw = localStorage.getItem(WEB_TOOLS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_WEB_TOOLS_SETTINGS;
    }

    return parseWebToolsSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_WEB_TOOLS_SETTINGS;
  }
}

export function writeWebToolsSettings(settings: WebToolsSettings): void {
  localStorage.setItem(WEB_TOOLS_STORAGE_KEY, JSON.stringify(settings));
}
