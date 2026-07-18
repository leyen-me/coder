import { TerminalIcon, PlusIcon, type LucideIcon } from "lucide-react";

export type SlashCommand = {
  slug: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export const BUILTIN_SLASH_COMMANDS: SlashCommand[] = [
  {
    slug: "new",
    label: "New Chat",
    description: "Start a new conversation",
    icon: PlusIcon,
  },
  {
    slug: "compact",
    label: "Compact",
    description: "Manual context compaction — summarize conversation to free token space",
    icon: TerminalIcon,
  },
];

export function searchSlashCommands(query: string): SlashCommand[] {
  const lower = query.toLowerCase().trim();
  if (!lower) {
    return BUILTIN_SLASH_COMMANDS;
  }

  return BUILTIN_SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.slug.includes(lower) ||
      cmd.label.toLowerCase().includes(lower) ||
      cmd.description.toLowerCase().includes(lower)
  );
}
