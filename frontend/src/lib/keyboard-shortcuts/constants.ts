import type {
  KeyboardShortcutsSettings,
  ShortcutActionDefinition,
  ShortcutActionGroup,
  ShortcutActionId,
} from "./types";

export const KEYBOARD_SHORTCUTS_STORAGE_KEY = "coder:keyboard-shortcuts";

export const SHORTCUT_ACTION_GROUPS: ShortcutActionGroup[] = [
  { id: "navigation" },
  { id: "panels" },
  { id: "chat" },
];

export const SHORTCUT_ACTIONS: ShortcutActionDefinition[] = [
  {
    id: "global.search",
    defaultBinding: "mod+k",
    scope: "global",
    allowInInput: true,
  },
  {
    id: "global.newChat",
    defaultBinding: "mod+n",
    scope: "global",
    allowInInput: true,
  },
  {
    id: "global.settings",
    defaultBinding: "mod+comma",
    scope: "global",
    allowInInput: true,
  },
  {
    id: "global.skills",
    defaultBinding: "mod+shift+s",
    scope: "global",
    allowInInput: true,
  },
  {
    id: "global.automations",
    defaultBinding: "mod+shift+a",
    scope: "global",
    allowInInput: true,
  },
  {
    id: "panel.toggleSidebar",
    defaultBinding: "mod+b",
    scope: "global",
    allowInInput: true,
  },
  {
    id: "chat.send",
    defaultBinding: "mod+enter",
    scope: "composer",
  },
  {
    id: "chat.cancel",
    defaultBinding: "escape",
    scope: "chat",
    allowInInput: true,
  },
  {
    id: "chat.regenerate",
    defaultBinding: "mod+shift+r",
    scope: "chat",
    allowInInput: true,
  },
  {
    id: "chat.editLastUser",
    defaultBinding: "mod+up",
    scope: "chat",
    allowInInput: true,
  },
  {
    id: "chat.copyLastCode",
    defaultBinding: "mod+shift+c",
    scope: "chat",
    allowInInput: true,
  },
];

export const SHORTCUT_ACTION_IDS: ShortcutActionId[] = SHORTCUT_ACTIONS.map(
  (action) => action.id
);

export function getShortcutActionDefinition(
  id: ShortcutActionId
): ShortcutActionDefinition {
  const definition = SHORTCUT_ACTIONS.find((action) => action.id === id);
  if (!definition) {
    throw new Error(`Unknown shortcut action: ${id}`);
  }
  return definition;
}

export function getActionsForGroup(
  groupId: ShortcutActionGroup["id"]
): ShortcutActionDefinition[] {
  const groupRanges: Record<ShortcutActionGroup["id"], ShortcutActionId[]> = {
    navigation: [
      "global.search",
      "global.newChat",
      "global.settings",
      "global.skills",
      "global.automations",
    ],
    panels: ["panel.toggleSidebar"],
    chat: [
      "chat.send",
      "chat.cancel",
      "chat.regenerate",
      "chat.editLastUser",
      "chat.copyLastCode",
    ],
  };

  const ids = new Set(groupRanges[groupId]);
  return SHORTCUT_ACTIONS.filter((action) => ids.has(action.id));
}
