import { getKVStore } from "@/lib/storage";
import { KEYBOARD_SHORTCUTS_STORAGE_KEY } from "./constants";
import {
  getDefaultKeyboardShortcuts,
  migrateBrowserConflictBindings,
} from "./default-bindings";
import { parseKeyboardShortcutsSettings } from "./parse-keyboard-shortcuts-settings";
import type { KeyboardShortcutsSettings } from "./types";

export function readKeyboardShortcutsSettings(): KeyboardShortcutsSettings {
  try {
    const raw = getKVStore().getItem(KEYBOARD_SHORTCUTS_STORAGE_KEY);
    if (!raw) {
      return getDefaultKeyboardShortcuts();
    }

    const parsed = parseKeyboardShortcutsSettings(JSON.parse(raw));
    const migrated = migrateBrowserConflictBindings(parsed);

    if (migrated !== parsed) {
      writeKeyboardShortcutsSettings(migrated);
    }

    return migrated;
  } catch {
    return getDefaultKeyboardShortcuts();
  }
}

export function writeKeyboardShortcutsSettings(
  settings: KeyboardShortcutsSettings
): void {
  getKVStore().setItem(
    KEYBOARD_SHORTCUTS_STORAGE_KEY,
    JSON.stringify(settings)
  );
}
