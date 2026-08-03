import { SparklesIcon, TerminalIcon, type LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import type { AvailableSkill } from "@/features/skills/types";
import { useTranslation } from "@/lib/i18n/locale-provider";

import type { SlashCommand } from "../lib/slash-commands";

export type SlashPopoverItem =
  | { kind: "command"; command: SlashCommand }
  | { kind: "skill"; skill: AvailableSkill };

type ComposerSlashPopoverProps = {
  open: boolean;
  anchorWidth: number | undefined;
  loading: boolean;
  items: SlashPopoverItem[];
  selectedIndex: number;
  onSelect: (item: SlashPopoverItem) => void;
  onSelectedIndexChange: (index: number) => void;
};

function itemIcon(item: SlashPopoverItem): LucideIcon {
  return item.kind === "command" ? TerminalIcon : SparklesIcon;
}

function slashItemValue(item: SlashPopoverItem): string {
  return item.kind === "command"
    ? `command:${item.command.slug}`
    : `skill:${item.skill.slug}`;
}

export function ComposerSlashPopover({
  open,
  anchorWidth,
  loading,
  items,
  selectedIndex,
  onSelect,
  onSelectedIndexChange,
}: ComposerSlashPopoverProps) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || loading || items.length === 0) {
      return;
    }

    const selected = listRef.current?.querySelector(
      `[data-slash-index="${selectedIndex}"]`
    );
    selected?.scrollIntoView({ block: "nearest" });
  }, [loading, open, items.length, selectedIndex]);

  if (!open) {
    return null;
  }

  const commandItems = items.filter(
    (item): item is SlashPopoverItem & { kind: "command" } =>
      item.kind === "command"
  );
  const skillItems = items.filter(
    (item): item is SlashPopoverItem & { kind: "skill" } =>
      item.kind === "skill"
  );

  const commandStartIndex = 0;
  const skillStartIndex = commandItems.length;
  const selectedValue =
    items[selectedIndex] != null ? slashItemValue(items[selectedIndex]) : "";

  return (
    <Popover modal={false} open={true}>
      <PopoverAnchor className="pointer-events-none absolute inset-x-0 top-0 h-0" />
      <PopoverContent
        align="start"
        className="gap-0 rounded-2xl p-0 shadow-lg"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
        side="top"
        sideOffset={8}
        style={anchorWidth ? { width: anchorWidth } : undefined}
      >
        <Command
          shouldFilter={false}
          value={selectedValue}
          onValueChange={(value) => {
            const index = items.findIndex(
              (item) => slashItemValue(item) === value
            );
            if (index >= 0) {
              onSelectedIndexChange(index);
            }
          }}
        >
          <CommandList className="max-h-60" ref={listRef}>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm">
                <Spinner className="size-4" />
                <span>{t("chat.skillSearching")}</span>
              </div>
            ) : null}

            {!loading && items.length === 0 ? (
              <CommandEmpty>{t("chat.skillNoResults")}</CommandEmpty>
            ) : null}

            {!loading && commandItems.length > 0 ? (
              <CommandGroup heading={t("chat.slashCommandsHeading")}>
                {commandItems.map((item, i) => {
                  const flatIndex = commandStartIndex + i;
                  const Icon = itemIcon(item);
                  return (
                    <CommandItem
                      key={`cmd-${item.command.slug}`}
                      data-slash-index={flatIndex}
                      className="gap-2 rounded-xl px-3 py-2"
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onSelect={() => {
                        onSelect(item);
                      }}
                      value={slashItemValue(item)}
                    >
                      <Icon className="size-4 shrink-0 opacity-70" />
                      <span className="min-w-0 truncate font-medium">
                        /{item.command.slug}
                      </span>
                      <span className="min-w-0 truncate text-muted-foreground text-xs">
                        {item.command.description}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}

            {!loading && skillItems.length > 0 ? (
              <CommandGroup heading={t("chat.slashSkillsHeading")}>
                {skillItems.map((item, i) => {
                  const flatIndex = skillStartIndex + i;
                  const Icon = itemIcon(item);
                  return (
                    <CommandItem
                      key={`sk-${item.skill.slug}`}
                      data-slash-index={flatIndex}
                      className="gap-2 rounded-xl px-3 py-2"
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onSelect={() => {
                        onSelect(item);
                      }}
                      value={slashItemValue(item)}
                    >
                      <Icon className="size-4 shrink-0 opacity-70" />
                      <span className="min-w-0 truncate font-medium">
                        {item.skill.name}
                      </span>
                      <span className="min-w-0 truncate font-mono text-muted-foreground text-xs">
                        /{item.skill.slug}
                      </span>
                      <span className="shrink-0 rounded-full bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {item.skill.source === "builtin"
                          ? t("skills.badgeBuiltin")
                          : item.skill.source === "workspace"
                            ? t("skills.badgeWorkspace")
                            : t("skills.badgeUser")}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
