import { useCallback, useSyncExternalStore } from "react";

import {
  DEFAULT_REFINE_PROMPT_SYSTEM_PROMPT,
  RESPONSE_STYLE_PRESETS,
} from "./constants";
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

  const toggleResponseStyle = useCallback((enabled: boolean) => {
    patchLabSettings({
      responseStyle: {
        ...getLabSettingsSnapshot().responseStyle,
        enabled,
      },
    });
  }, []);

  const selectResponseStyle = useCallback((key: string) => {
    patchLabSettings({
      responseStyle: {
        ...getLabSettingsSnapshot().responseStyle,
        selectedKey: key,
      },
    });
  }, []);

  const updateResponseStyleCustomPrompt = useCallback(
    (key: string, prompt: string) => {
      patchLabSettings({
        responseStyle: {
          ...getLabSettingsSnapshot().responseStyle,
          customPrompts: {
            ...getLabSettingsSnapshot().responseStyle.customPrompts,
            [key]: prompt,
          },
        },
      });
    },
    []
  );

  const resetResponseStyleCustomPrompt = useCallback((key: string) => {
    const current = getLabSettingsSnapshot().responseStyle;
    const next = { ...current.customPrompts };
    delete next[key];

    patchLabSettings({
      responseStyle: {
        ...current,
        customPrompts: next,
      },
    });
  }, []);

  const getActiveStylePreset = useCallback(() => {
    const { responseStyle } = getLabSettingsSnapshot();
    if (!responseStyle.enabled) {
      return null;
    }
    return (
      RESPONSE_STYLE_PRESETS.find((p) => p.key === responseStyle.selectedKey) ??
      null
    );
  }, []);

  return {
    settings,
    updateSettings,
    resetPromptRefineSystemPrompt,
    toggleResponseStyle,
    selectResponseStyle,
    updateResponseStyleCustomPrompt,
    resetResponseStyleCustomPrompt,
    getActiveStylePreset,
  };
}
