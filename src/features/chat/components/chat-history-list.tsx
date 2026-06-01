import { ListFilter } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import type { ChatHistoryItem } from "../data/mock-chats";

type ChatHistoryListProps = {
  items: ChatHistoryItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function ChatHistoryList({
  items,
  selectedId,
  onSelect,
}: ChatHistoryListProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 px-2">
      <div className="flex shrink-0 items-center justify-between px-1 py-1">
        <span className="text-xs font-medium text-muted-foreground">所有聊天</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          aria-label="筛选聊天"
        >
          <ListFilter className="size-3.5" />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <ul className="flex flex-col gap-0.5 pr-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
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
              </button>
            </li>
          ))}
        </ul>
      </ScrollArea>

      <Button
        type="button"
        variant="ghost"
        className="h-8 shrink-0 justify-start px-2 text-xs text-muted-foreground"
      >
        展开更多
      </Button>
    </div>
  );
}
