import { ListFilter } from "lucide-react";
import { Link } from "react-router-dom";

import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import { SessionTitleLabel } from "@/features/chat/components/session-title-label";
import type { ChatHistoryItem } from "@/lib/db";

type ChatHistoryListProps = {
  items: ReadonlyArray<ChatHistoryItem>;
  selectedId: string | null;
  generatingTitleIds?: ReadonlySet<string>;
  historyActive?: boolean;
};

export function ChatHistoryList({
  items,
  selectedId,
  generatingTitleIds,
  historyActive = false,
}: ChatHistoryListProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 px-2">
      <div className="flex shrink-0 items-center justify-between px-1 py-1">
        <Link
          to={paths.history}
          className={cn(
            "text-xs font-medium text-muted-foreground transition-colors hover:text-sidebar-foreground",
            historyActive && "text-sidebar-foreground"
          )}
        >
          {t("sidebar.allChats")}
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          aria-label={t("sidebar.filterChats")}
        >
          <ListFilter className="size-3.5" />
        </Button>
      </div>

      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <ul className="flex w-full min-w-0 flex-col gap-0.5 pr-2">
          {items.map((item) => {
            const isGeneratingTitle = generatingTitleIds?.has(item.id) ?? false;

            return (
              <li key={item.id} className="min-w-0">
                <Link
                  to={paths.chat(item.id)}
                  className={cn(
                    "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition-colors hover:bg-sidebar-accent",
                    selectedId === item.id &&
                      "bg-sidebar-accent text-sidebar-accent-foreground"
                  )}
                >
                  <SessionTitleLabel
                    title={item.title}
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
      </ScrollArea>

      <Button
        type="button"
        variant="ghost"
        className="h-8 shrink-0 justify-start px-2 text-xs text-muted-foreground"
        asChild
      >
        <Link to={paths.history}>{t("sidebar.showMore")}</Link>
      </Button>
    </div>
  );
}
