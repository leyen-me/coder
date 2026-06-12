import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  getShortcutActionDefinition,
} from "./constants";
import { mergeKeyboardShortcutsSettings } from "./parse-keyboard-shortcuts-settings";
import {
  readKeyboardShortcutsSettings,
  writeKeyboardShortcutsSettings,
} from "./storage";
import type {
  KeyboardShortcutsSettings,
  ShortcutActionId,
  ShortcutBinding,
} from "./types";

type KeyboardShortcutsContextValue = {
  settings: KeyboardShortcutsSettings;
  getBinding: (actionId: ShortcutActionId) => ShortcutBinding;
  setBinding: (actionId: ShortcutActionId, binding: ShortcutBinding) => void;
  resetBinding: (actionId: ShortcutActionId) => void;
  resetAllBindings: () => void;
  setSettings: (settings: KeyboardShortcutsSettings) => void;
};

const KeyboardShortcutsContext =
  createContext<KeyboardShortcutsContextValue | null>(null);

type KeyboardShortcutsProviderProps = {
  children: ReactNode;
};

export function KeyboardShortcutsProvider({
  children,
}: KeyboardShortcutsProviderProps) {
  const [settings, setSettingsState] = useState<KeyboardShortcutsSettings>(
    readKeyboardShortcutsSettings
  );

  const setSettings = useCallback((nextSettings: KeyboardShortcutsSettings) => {
    setSettingsState(nextSettings);
    writeKeyboardShortcutsSettings(nextSettings);
  }, []);

  const getBinding = useCallback(
    (actionId: ShortcutActionId) => settings[actionId] ?? "",
    [settings]
  );

  const setBinding = useCallback(
    (actionId: ShortcutActionId, binding: ShortcutBinding) => {
      setSettingsState((current) => {
        const next = mergeKeyboardShortcutsSettings(current, {
          [actionId]: binding,
        });
        writeKeyboardShortcutsSettings(next);
        return next;
      });
    },
    []
  );

  const resetBinding = useCallback((actionId: ShortcutActionId) => {
    setBinding(actionId, getShortcutActionDefinition(actionId).defaultBinding);
  }, [setBinding]);

  const resetAllBindings = useCallback(() => {
    setSettings({ ...DEFAULT_KEYBOARD_SHORTCUTS });
  }, [setSettings]);

  const value = useMemo(
    () => ({
      settings,
      getBinding,
      setBinding,
      resetBinding,
      resetAllBindings,
      setSettings,
    }),
    [getBinding, resetAllBindings, resetBinding, setBinding, setSettings, settings]
  );

  return (
    <KeyboardShortcutsContext.Provider value={value}>
      {children}
    </KeyboardShortcutsContext.Provider>
  );
}

export function useKeyboardShortcuts(): KeyboardShortcutsContextValue {
  const context = useContext(KeyboardShortcutsContext);

  if (!context) {
    throw new Error(
      "useKeyboardShortcuts must be used within KeyboardShortcutsProvider"
    );
  }

  return context;
}
