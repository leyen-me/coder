import { FileIcon, FolderIcon } from "lucide-react";
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
import { useTranslation } from "@/lib/i18n/locale-provider";

import type { WorkspacePathMatch } from "../lib/search-workspace-paths";

type ComposerMentionPopoverProps = {
  open: boolean;
  anchorWidth: number | undefined;
  results: WorkspacePathMatch[];
  loading: boolean;
  hasWorkspace: boolean;
  selectedIndex: number;
  onSelect: (item: WorkspacePathMatch) => void;
  onSelectedIndexChange: (index: number) => void;
};

export function ComposerMentionPopover({
  open,
  anchorWidth,
  results,
  loading,
  hasWorkspace,
  selectedIndex,
  onSelect,
  onSelectedIndexChange,
}: ComposerMentionPopoverProps) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  const selectedValue = results[selectedIndex]?.path ?? "";

  useEffect(() => {
    if (!open || loading || results.length === 0) {
      return;
    }

    const selected = listRef.current?.querySelector(
      `[data-mention-index="${selectedIndex}"]`
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
        <Command
          shouldFilter={false}
          value={selectedValue}
          onValueChange={(value) => {
            const index = results.findIndex((item) => item.path === value);
            if (index >= 0) {
              onSelectedIndexChange(index);
            }
          }}
        >
          <CommandList className="max-h-60" ref={listRef}>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm">
                <Spinner className="size-4" />
                <span>{t("chat.mentionSearching")}</span>
              </div>
            ) : null}

            {!loading && !hasWorkspace ? (
              <CommandEmpty>{t("chat.mentionNoWorkspace")}</CommandEmpty>
            ) : null}

            {!loading && hasWorkspace && results.length === 0 ? (
              <CommandEmpty>{t("chat.mentionNoResults")}</CommandEmpty>
            ) : null}

            {!loading && results.length > 0 ? (
              <CommandGroup>
                {results.map((item, index) => {
                  const Icon = item.isDir ? FolderIcon : FileIcon;
                  const showFullPath = item.path !== item.name;

                  return (
                    <CommandItem
                      key={`${item.path}:${item.isDir ? "dir" : "file"}`}
                      data-mention-index={index}
                      className="gap-2 rounded-xl px-3 py-2"
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onSelect={() => {
                        onSelect(item);
                      }}
                      value={item.path}
                    >
                      <Icon className="size-4 shrink-0 opacity-70" />
                      <span className="min-w-0 truncate font-medium">
                        {item.name}
                      </span>
                      {showFullPath ? (
                        <span
                          className="min-w-0 truncate text-muted-foreground text-xs"
                          title={item.path}
                        >
                          {item.path}
                        </span>
                      ) : null}
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
