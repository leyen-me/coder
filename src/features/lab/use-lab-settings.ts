import { useCallback, useSyncExternalStore } from "react";

import { DEFAULT_REFINE_PROMPT_SYSTEM_PROMPT } from "./constants";
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

  const resetPromptRefineSystemPrompt = useCallback(() => {
    patchLabSettings({
      promptRefineSystemPrompt: DEFAULT_REFINE_PROMPT_SYSTEM_PROMPT,
    });
  }, []);

  return {
    settings,
    updateSettings,
    resetPromptRefineSystemPrompt,
  };
}
