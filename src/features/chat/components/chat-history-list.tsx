import { ListFilter } from "lucide-react";
import { Link } from "react-router-dom";

import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import type { ChatHistoryItem } from "@/lib/db";

type ChatHistoryListProps = {
  items: ReadonlyArray<ChatHistoryItem>;
  selectedId: string | null;
  historyActive?: boolean;
};

export function ChatHistoryList({
  items,
  selectedId,
  historyActive = false,
}: ChatHistoryListProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 px-2">
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

      <ScrollArea className="min-h-0 flex-1">
        <ul className="flex flex-col gap-0.5 pr-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to={paths.chat(item.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition-colors hover:bg-sidebar-accent",
                  selectedId === item.id &&
                    "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
              >
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {item.relativeTime}
                </span>
              </Link>
            </li>
          ))}
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
