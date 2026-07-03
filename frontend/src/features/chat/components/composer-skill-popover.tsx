import { SparklesIcon } from "lucide-react";
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
import type { SkillListItem } from "@/features/skills/types";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

type ComposerSkillPopoverProps = {
  open: boolean;
  anchorWidth: number | undefined;
  results: SkillListItem[];
  loading: boolean;
  selectedIndex: number;
  onSelect: (item: SkillListItem) => void;
  onSelectedIndexChange: (index: number) => void;
};

export function ComposerSkillPopover({
  open,
  anchorWidth,
  results,
  loading,
  selectedIndex,
  onSelect,
  onSelectedIndexChange,
}: ComposerSkillPopoverProps) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || loading || results.length === 0) {
      return;
    }

    const selected = listRef.current?.querySelector(
      `[data-skill-index="${selectedIndex}"]`
    );
    selected?.scrollIntoView({ block: "nearest" });
  }, [loading, open, results.length, selectedIndex]);

  return (
    <Popover modal={false} open={open}>
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
        <Command shouldFilter={false} value="">
          <CommandList className="max-h-60" ref={listRef}>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm">
                <Spinner className="size-4" />
                <span>{t("chat.skillSearching")}</span>
              </div>
            ) : null}

            {!loading && results.length === 0 ? (
              <CommandEmpty>{t("chat.skillNoResults")}</CommandEmpty>
            ) : null}

            {!loading && results.length > 0 ? (
              <CommandGroup>
                {results.map((item, index) => (
                  <CommandItem
                    key={`${item.source}:${item.slug}`}
                    data-skill-index={index}
                    className={cn(
                      "gap-2 rounded-xl px-3 py-2",
                      index === selectedIndex && "bg-muted"
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onMouseEnter={() => {
                      onSelectedIndexChange(index);
                    }}
                    onSelect={() => {
                      onSelect(item);
                    }}
                    value={item.slug}
                  >
                    <SparklesIcon className="size-4 shrink-0 opacity-70" />
                    <span className="min-w-0 truncate font-medium">
                      {item.name}
                    </span>
                    <span className="min-w-0 truncate font-mono text-muted-foreground text-xs">
                      /{item.slug}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
