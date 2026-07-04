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
  "global.history": {
    label: "settings.keyboardShortcuts.actions.global.history.label",
    description: "settings.keyboardShortcuts.actions.global.history.description",
  },
  "panel.toggleSidebar": {
    label: "settings.keyboardShortcuts.actions.panel.toggleSidebar.label",
    description:
      "settings.keyboardShortcuts.actions.panel.toggleSidebar.description",
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
