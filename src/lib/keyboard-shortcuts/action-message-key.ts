import type { MessageKey } from "@/lib/i18n/messages";

import type { ShortcutActionId } from "./types";

const ACTION_MESSAGE_KEYS = {
  "global.search": {
    label: "settings.keyboardShortcuts.actions.global.search.label",
    description: "settings.keyboardShortcuts.actions.global.search.description",
  },
  "global.newChat": {
    label: "settings.keyboardShortcuts.actions.global.newChat.label",
    description: "settings.keyboardShortcuts.actions.global.newChat.description",
  },
  "global.settings": {
    label: "settings.keyboardShortcuts.actions.global.settings.label",
    description: "settings.keyboardShortcuts.actions.global.settings.description",
  },
  "global.skills": {
    label: "settings.keyboardShortcuts.actions.global.skills.label",
    description: "settings.keyboardShortcuts.actions.global.skills.description",
  },
  "global.automations": {
    label: "settings.keyboardShortcuts.actions.global.automations.label",
    description:
      "settings.keyboardShortcuts.actions.global.automations.description",
  },
  "global.statistics": {
    label: "settings.keyboardShortcuts.actions.global.statistics.label",
    description:
      "settings.keyboardShortcuts.actions.global.statistics.description",
  },
  "global.newWindow": {
    label: "settings.keyboardShortcuts.actions.global.newWindow.label",
    description:
      "settings.keyboardShortcuts.actions.global.newWindow.description",
  },
  "global.history": {
    label: "settings.keyboardShortcuts.actions.global.history.label",
    description: "settings.keyboardShortcuts.actions.global.history.description",
  },
  "panel.toggleSidebar": {
    label: "settings.keyboardShortcuts.actions.panel.toggleSidebar.label",
    description:
      "settings.keyboardShortcuts.actions.panel.toggleSidebar.description",
  },
  "panel.toggleBottom": {
    label: "settings.keyboardShortcuts.actions.panel.toggleBottom.label",
    description:
      "settings.keyboardShortcuts.actions.panel.toggleBottom.description",
  },
  "panel.bottomTerminal": {
    label: "settings.keyboardShortcuts.actions.panel.bottomTerminal.label",
    description:
      "settings.keyboardShortcuts.actions.panel.bottomTerminal.description",
  },
  "panel.bottomProcesses": {
    label: "settings.keyboardShortcuts.actions.panel.bottomProcesses.label",
    description:
      "settings.keyboardShortcuts.actions.panel.bottomProcesses.description",
  },
  "panel.toggleRight": {
    label: "settings.keyboardShortcuts.actions.panel.toggleRight.label",
    description:
      "settings.keyboardShortcuts.actions.panel.toggleRight.description",
  },
  "chat.send": {
    label: "settings.keyboardShortcuts.actions.chat.send.label",
    description: "settings.keyboardShortcuts.actions.chat.send.description",
  },
  "chat.cancel": {
    label: "settings.keyboardShortcuts.actions.chat.cancel.label",
    description: "settings.keyboardShortcuts.actions.chat.cancel.description",
  },
  "chat.regenerate": {
    label: "settings.keyboardShortcuts.actions.chat.regenerate.label",
    description: "settings.keyboardShortcuts.actions.chat.regenerate.description",
  },
  "chat.editLastUser": {
    label: "settings.keyboardShortcuts.actions.chat.editLastUser.label",
    description:
      "settings.keyboardShortcuts.actions.chat.editLastUser.description",
  },
  "chat.copyLastCode": {
    label: "settings.keyboardShortcuts.actions.chat.copyLastCode.label",
    description:
      "settings.keyboardShortcuts.actions.chat.copyLastCode.description",
  },
  "file.quickOpen": {
    label: "settings.keyboardShortcuts.actions.file.quickOpen.label",
    description: "settings.keyboardShortcuts.actions.file.quickOpen.description",
  },
  "file.closePreview": {
    label: "settings.keyboardShortcuts.actions.file.closePreview.label",
    description:
      "settings.keyboardShortcuts.actions.file.closePreview.description",
  },
  "file.save": {
    label: "settings.keyboardShortcuts.actions.file.save.label",
    description: "settings.keyboardShortcuts.actions.file.save.description",
  },
  "terminal.focus": {
    label: "settings.keyboardShortcuts.actions.terminal.focus.label",
    description: "settings.keyboardShortcuts.actions.terminal.focus.description",
  },
} as const satisfies Record<
  ShortcutActionId,
  Record<"label" | "description", MessageKey>
>;

export function shortcutActionMessageKey(
  actionId: ShortcutActionId,
  field: "label" | "description"
): MessageKey {
  return ACTION_MESSAGE_KEYS[actionId][field];
}
