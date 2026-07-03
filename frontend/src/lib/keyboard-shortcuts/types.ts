export type ShortcutActionId =
  | "global.search"
  | "global.newChat"
  | "global.settings"
  | "global.skills"
  | "global.automations"
  | "global.history"
  | "panel.toggleSidebar"
  | "panel.toggleBottom"
  | "panel.bottomTerminal"
  | "panel.bottomProcesses"
  | "chat.send"
  | "chat.cancel"
  | "chat.regenerate"
  | "chat.editLastUser"
  | "chat.copyLastCode"
  | "terminal.focus";

export type ShortcutScope =
  | "global"
  | "chat"
  | "composer"
  | "terminal";

export type ShortcutBinding = string;

export type KeyboardShortcutsSettings = Record<ShortcutActionId, ShortcutBinding>;

export type ShortcutActionDefinition = {
  id: ShortcutActionId;
  defaultBinding: ShortcutBinding;
  scope: ShortcutScope;
  /** When true, the shortcut works inside text inputs and contenteditable areas. */
  allowInInput?: boolean;
};

export type ShortcutActionGroup = {
  id: "navigation" | "panels" | "chat" | "terminal";
};
