import { readLabSettings, writeLabSettings as persistLabSettings } from "./storage";
import type { LabSettings } from "./types";

const listeners = new Set<() => void>();

let cachedSnapshot: LabSettings = readLabSettings();

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeLabSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLabSettingsSnapshot(): LabSettings {
  return cachedSnapshot;
}

export function setLabSettings(nextSettings: LabSettings): void {
  persistLabSettings(nextSettings);
  cachedSnapshot = nextSettings;
  emitChange();
}

export function patchLabSettings(patch: Partial<LabSettings>): void {
  setLabSettings({
    ...cachedSnapshot,
    ...patch,
  });
}
