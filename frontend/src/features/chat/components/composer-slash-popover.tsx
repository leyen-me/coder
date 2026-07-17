import { SparklesIcon, type LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import type { SlashCommand } from "../lib/slash-commands";
import type { AvailableSkill } from "@/features/skills/types";

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
  anchorRef: React.RefObject<HTMLDivElement | null>;
};

const ITEM_ICON_CLASS = "mr-2 size-4 shrink-0";

function itemLabel(item: SlashPopoverItem): string {
  return item.kind === "command"
    ? `/${item.command.slug}`
    : `/${item.skill.slug}`;
}

function itemIcon(item: SlashPopoverItem): LucideIcon {
  return item.kind === "command" ? item.command.icon : SparklesIcon;
}

export function ComposerSlashPopover({
  open,
  anchorWidth,
  loading,
  items,
  selectedIndex,
  onSelect,
  onSelectedIndexChange,
  anchorRef,
}: ComposerSlashPopoverProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the selected item into view
  useEffect(() => {
    if (!open || selectedIndex < 0 || !listRef.current) {
      return;
    }

    const container = listRef.current;
    const items = container.querySelectorAll<HTMLElement>(
      '[data-slash-item="true"]'
    );
    const selected = items[selectedIndex];
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [open, selectedIndex]);

  const commandItems = items.filter(
    (item): item is SlashPopoverItem & { kind: "command" } =>
      item.kind === "command"
  );
  const skillItems = items.filter(
    (item): item is SlashPopoverItem & { kind: "skill" } =>
      item.kind === "skill"
  );

  // Compute the flat index of the first item in each group
  const commandStartIndex = 0;
  const skillStartIndex = commandItems.length;

  return (
    <Popover open={open} modal={false}>
      <PopoverAnchor virtualRef={anchorRef as React.RefObject<{ readonly getBoundingClientRect: () => DOMRect }>} />
      <PopoverContent
        align="start"
        className="p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        style={{ width: anchorWidth ?? 320 }}
      >
        <Command>
          <CommandList ref={listRef}>
            {loading && items.length === 0 && (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                Loading…
              </div>
            )}
            {!loading && items.length === 0 && (
              <CommandEmpty>No results</CommandEmpty>
            )}

            {commandItems.length > 0 && (
              <CommandGroup heading="Commands">
                {commandItems.map((item, i) => {
                  const flatIndex = commandStartIndex + i;
                  const Icon = itemIcon(item);
                  return (
                    <CommandItem
                      key={`cmd-${item.command.slug}`}
                      data-slash-item="true"
                      data-selected={flatIndex === selectedIndex || undefined}
                      onMouseEnter={() => onSelectedIndexChange(flatIndex)}
                      onSelect={() => onSelect(item)}
                    >
                      <Icon className={ITEM_ICON_CLASS} />
                      <span className="flex-1">
                        <span className="font-medium">{itemLabel(item)}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {item.command.description}
                        </span>
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {skillItems.length > 0 && (
              <CommandGroup heading="Skills">
                {skillItems.map((item, i) => {
                  const flatIndex = skillStartIndex + i;
                  const Icon = itemIcon(item);
                  return (
                    <CommandItem
                      key={`sk-${item.skill.slug}`}
                      data-slash-item="true"
                      data-selected={flatIndex === selectedIndex || undefined}
                      onMouseEnter={() => onSelectedIndexChange(flatIndex)}
                      onSelect={() => onSelect(item)}
                    >
                      <Icon className={ITEM_ICON_CLASS} />
                      <span className="flex-1">
                        <span className="font-medium">
                          {itemLabel(item)}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {item.skill.description}
                        </span>
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
