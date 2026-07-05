import { SHORTCUT_ACTION_IDS } from "./constants";
import { getDefaultKeyboardShortcuts } from "./default-bindings";
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
    return { ...getDefaultKeyboardShortcuts() };
  }

  const record = value as Record<string, unknown>;
  const settings = { ...getDefaultKeyboardShortcuts() };

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
