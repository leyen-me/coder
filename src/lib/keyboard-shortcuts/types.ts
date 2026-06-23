export type ShortcutActionId =
  | "global.search"
  | "global.newChat"
  | "global.newWindow"
  | "global.settings"
  | "global.skills"
  | "global.automations"
  | "global.statistics"
  | "global.history"
  | "panel.toggleSidebar"
  | "panel.toggleBottom"
  | "panel.bottomTerminal"
  | "panel.bottomProcesses"
  | "panel.toggleRight"
  | "chat.send"
  | "chat.cancel"
  | "chat.regenerate"
  | "chat.editLastUser"
  | "chat.copyLastCode"
  | "file.quickOpen"
  | "file.closePreview"
  | "file.save"
  | "terminal.focus";

export type ShortcutScope =
  | "global"
  | "chat"
  | "composer"
  | "file"
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
  id: "navigation" | "panels" | "chat" | "file" | "terminal";
};
