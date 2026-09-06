import { PlusIcon, TerminalIcon, type LucideIcon } from "lucide-react";

import type { MessageKey } from "@/lib/i18n/messages";

export type SlashCommand = {
  slug: string;
  label: string;
  descriptionKey: Extract<MessageKey, `chat.slash${string}Description`>;
  icon: LucideIcon;
};

export const BUILTIN_SLASH_COMMANDS: SlashCommand[] = [
  {
    slug: "new",
    label: "New Chat",
    descriptionKey: "chat.slashNewDescription",
    icon: PlusIcon,
  },
  {
    slug: "compact",
    label: "Compact",
    descriptionKey: "chat.slashCompactDescription",
    icon: TerminalIcon,
  },
];

export function searchSlashCommands(query: string): SlashCommand[] {
  const lower = query.toLowerCase().trim();
  if (!lower) {
    return BUILTIN_SLASH_COMMANDS;
  }

  return BUILTIN_SLASH_COMMANDS.filter(
    (cmd) => cmd.slug.includes(lower) || cmd.label.toLowerCase().includes(lower)
  );
}
