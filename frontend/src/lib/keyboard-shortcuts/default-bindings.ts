import { SHORTCUT_ACTIONS, SHORTCUT_ACTION_IDS } from "./constants";
import { isMacPlatform } from "./platform";
import type {
  KeyboardShortcutsSettings,
  ShortcutActionId,
  ShortcutBinding,
} from "./types";

/** Browser-reserved shortcuts on Windows/Linux that cannot be overridden in-page. */
const NON_MAC_BINDING_OVERRIDES: Partial<
  Record<ShortcutActionId, ShortcutBinding>
> = {
  "global.newChat": "mod+alt+n",
  "chat.regenerate": "mod+alt+r",
};

const LEGACY_BROWSER_CONFLICT_BINDINGS: Partial<
  Record<ShortcutActionId, ShortcutBinding>
> = {
  "global.newChat": "mod+n",
  "chat.regenerate": "mod+shift+r",
};

export function getDefaultBinding(actionId: ShortcutActionId): ShortcutBinding {
  const override = NON_MAC_BINDING_OVERRIDES[actionId];
  if (!isMacPlatform() && override) {
    return override;
  }

  const definition = SHORTCUT_ACTIONS.find((action) => action.id === actionId);
  if (!definition) {
    throw new Error(`Unknown shortcut action: ${actionId}`);
  }

  return definition.defaultBinding;
}

export function getDefaultKeyboardShortcuts(): KeyboardShortcutsSettings {
  return Object.fromEntries(
    SHORTCUT_ACTION_IDS.map((id) => [id, getDefaultBinding(id)])
  ) as KeyboardShortcutsSettings;
}

export function migrateBrowserConflictBindings(
  settings: KeyboardShortcutsSettings
): KeyboardShortcutsSettings {
  if (isMacPlatform()) {
    return settings;
  }

  let changed = false;
  const next = { ...settings };

  for (const [actionId, legacyBinding] of Object.entries(
    LEGACY_BROWSER_CONFLICT_BINDINGS
  ) as [ShortcutActionId, ShortcutBinding][]) {
    if (next[actionId] === legacyBinding) {
      next[actionId] = getDefaultBinding(actionId);
      changed = true;
    }
  }

  return changed ? next : settings;
}
