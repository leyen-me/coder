import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  SHORTCUT_ACTION_IDS,
} from "./constants";
import { normalizeBinding } from "./match";
import type {
  KeyboardShortcutsSettings,
  ShortcutActionId,
  ShortcutBinding,
} from "./types";

function isShortcutActionId(value: string): value is ShortcutActionId {
  return SHORTCUT_ACTION_IDS.includes(value as ShortcutActionId);
}

function parseBinding(value: unknown): ShortcutBinding {
  if (typeof value !== "string") {
    return "";
  }

  return normalizeBinding(value);
}

export function parseKeyboardShortcutsSettings(
  value: unknown
): KeyboardShortcutsSettings {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_KEYBOARD_SHORTCUTS };
  }

  const record = value as Record<string, unknown>;
  const settings = { ...DEFAULT_KEYBOARD_SHORTCUTS };

  for (const id of SHORTCUT_ACTION_IDS) {
    if (id in record) {
      settings[id] = parseBinding(record[id]);
    }
  }

  return settings;
}

export function mergeKeyboardShortcutsSettings(
  current: KeyboardShortcutsSettings,
  patch: Partial<KeyboardShortcutsSettings>
): KeyboardShortcutsSettings {
  const next = { ...current };

  for (const [rawId, binding] of Object.entries(patch)) {
    if (!isShortcutActionId(rawId)) {
      continue;
    }
    next[rawId] = parseBinding(binding);
  }

  return next;
}
