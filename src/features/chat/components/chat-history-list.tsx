import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { paths } from "@/app/paths";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import { SessionTitleLabel } from "@/features/chat/components/session-title-label";
import type { ChatHistoryItem } from "@/lib/db";

import { ChatHistoryFilterPopover } from "./chat-history-filter-popover";
import {
  DEFAULT_CHAT_HISTORY_FILTERS,
  filterChatHistoryItems,
  isChatHistoryFiltersActive,
} from "../lib/filter-chat-history";

type ChatHistoryListProps = {
  items: ReadonlyArray<ChatHistoryItem>;
  selectedId: string | null;
  generatingTitleIds?: ReadonlySet<string>;
  runningSessionIds?: ReadonlySet<string>;
};

export function ChatHistoryList({
  items,
  selectedId,
  generatingTitleIds,
  runningSessionIds,
}: ChatHistoryListProps) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState(DEFAULT_CHAT_HISTORY_FILTERS);

  const filteredItems = useMemo(
    () => filterChatHistoryItems(items, filters),
    [items, filters]
  );
  const hasActiveFilters = isChatHistoryFiltersActive(filters);
  const showNoMatches =
    hasActiveFilters && items.length > 0 && filteredItems.length === 0;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 px-2">
      <div className="flex shrink-0 items-center justify-between px-1 py-1">
        <h2 className="text-xs font-medium text-muted-foreground">
          {t("sidebar.allChats")}
        </h2>
        <ChatHistoryFilterPopover
          items={items}
          filters={filters}
          onFiltersChange={setFilters}
        />
      </div>

      <ScrollArea className="min-h-0 min-w-0 flex-1">
        {showNoMatches ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            {t("sidebar.noMatchingChats")}
          </p>
        ) : (
          <ul className="flex w-full min-w-0 flex-col gap-0.5 pr-2">
            {filteredItems.map((item) => {
              const isGeneratingTitle = generatingTitleIds?.has(item.id) ?? false;
              const isRunning = runningSessionIds?.has(item.id) ?? false;

              return (
                <li key={item.id} className="min-w-0">
                  <Link
                    to={paths.chat(item.id)}
                    className={cn(
                      "grid w-full min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition-colors hover:bg-sidebar-accent",
                      isRunning
                        ? "grid-cols-[auto_minmax(0,1fr)_auto]"
                        : "grid-cols-[minmax(0,1fr)_auto]",
                      selectedId === item.id &&
                        "bg-sidebar-accent text-sidebar-accent-foreground"
                    )}
                  >
                    {isRunning ? (
                      <Spinner
                        className="size-3 shrink-0 text-muted-foreground"
                        aria-label={t("sidebar.agentRunning")}
                      />
                    ) : null}
                    <SessionTitleLabel
                      title={item.title}
                      sessionKind={item.sessionKind}
                      isGenerating={isGeneratingTitle}
                    />
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {item.relativeTime}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
