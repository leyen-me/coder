import { getKVStore } from "@/lib/storage";
import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  KEYBOARD_SHORTCUTS_STORAGE_KEY,
} from "./constants";
import { parseKeyboardShortcutsSettings } from "./parse-keyboard-shortcuts-settings";
import type { KeyboardShortcutsSettings } from "./types";

export function readKeyboardShortcutsSettings(): KeyboardShortcutsSettings {
  try {
    const raw = getKVStore().getItem(KEYBOARD_SHORTCUTS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_KEYBOARD_SHORTCUTS;
    }

    return parseKeyboardShortcutsSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_KEYBOARD_SHORTCUTS;
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
