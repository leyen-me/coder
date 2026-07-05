import { getKVStore } from "@/lib/storage";
import { DEFAULT_LAB_SETTINGS, LAB_STORAGE_KEY } from "./constants";
import { parseLabSettings } from "./parse-lab-settings";
import type { LabSettings } from "./types";

export function readLabSettings(): LabSettings {
  try {
    const raw = getKVStore().getItem(LAB_STORAGE_KEY);
    if (raw) {
      return parseLabSettings(JSON.parse(raw));
    }

    return DEFAULT_LAB_SETTINGS;
  } catch {
    return DEFAULT_LAB_SETTINGS;
  }
}

export function writeLabSettings(settings: LabSettings): void {
  getKVStore().setItem(LAB_STORAGE_KEY, JSON.stringify(settings));
}
