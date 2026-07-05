import { useCallback, useSyncExternalStore } from "react";

import {
  getLabSettingsSnapshot,
  patchLabSettings,
  subscribeLabSettings,
} from "./lab-settings-store";
import type { LabSettings } from "./types";

export function useLabSettings() {
  const settings = useSyncExternalStore(
    subscribeLabSettings,
    getLabSettingsSnapshot,
    getLabSettingsSnapshot
  );

  const updateSettings = useCallback((patch: Partial<LabSettings>) => {
    patchLabSettings(patch);
  }, []);

  return {
    settings,
    updateSettings,
  };
}
