import { ListFilter } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getWorkspaceDisplayName } from "@/features/workspace/storage";
import type { ChatHistoryItem } from "@/lib/db";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import {
  CHAT_HISTORY_WORKSPACE_ALL,
  CHAT_HISTORY_WORKSPACE_NONE,
  collectChatHistoryWorkspaceDirs,
  isChatHistoryFiltersActive,
  type ChatHistoryFilters,
  type ChatHistoryTimeFilter,
  type ChatHistoryWorkspaceFilter,
} from "../lib/filter-chat-history";

type ChatHistoryFilterPopoverProps = {
  items: ReadonlyArray<ChatHistoryItem>;
  filters: ChatHistoryFilters;
  onFiltersChange: (filters: ChatHistoryFilters) => void;
};

const TIME_FILTERS: ChatHistoryTimeFilter[] = ["all", "today", "week", "month"];

const FILTER_MENU_CONTENT_CLASS =
  "no-scrollbar min-w-36 max-w-48 max-h-64 overflow-y-auto overscroll-contain rounded-xl";
const FILTER_MENU_LABEL_CLASS =
  "min-w-0 px-2.5 py-0.5 text-[10px] font-normal text-muted-foreground";
const FILTER_MENU_GROUP_CLASS = "flex flex-col gap-0.5";
const FILTER_MENU_ITEM_CLASS =
  "min-w-0 gap-2 overflow-hidden rounded-lg py-1 pl-2.5 text-xs font-normal data-[state=checked]:bg-muted data-[state=checked]:text-foreground focus:data-[state=checked]:bg-muted";
const FILTER_MENU_TEXT_CLASS = "min-w-0 truncate";

function isChatHistoryTimeFilter(value: string): value is ChatHistoryTimeFilter {
  return (TIME_FILTERS as string[]).includes(value);
}

export function ChatHistoryFilterPopover({
  items,
  filters,
  onFiltersChange,
}: ChatHistoryFilterPopoverProps) {
  const { t } = useTranslation();
  const hasActiveFilters = isChatHistoryFiltersActive(filters);
  const workspaceDirs = collectChatHistoryWorkspaceDirs(items);
  const hasNoWorkspaceSessions = items.some(
    (item) => !item.workspaceDir?.trim()
  );

  const timeLabel = (time: ChatHistoryTimeFilter) => {
    switch (time) {
      case "all":
        return t("sidebar.filterTimeAll");
      case "today":
        return t("sidebar.filterTimeToday");
      case "week":
        return t("sidebar.filterTimeWeek");
      case "month":
        return t("sidebar.filterTimeMonth");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={cn(
            "text-muted-foreground",
            hasActiveFilters && "bg-muted text-foreground"
          )}
          aria-label={t("sidebar.filterChats")}
        >
          <ListFilter className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={FILTER_MENU_CONTENT_CLASS}>
        <DropdownMenuLabel className={FILTER_MENU_LABEL_CLASS}>
          <span className={FILTER_MENU_TEXT_CLASS}>{t("sidebar.filterTime")}</span>
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          className={FILTER_MENU_GROUP_CLASS}
          value={filters.time}
          onValueChange={(value) => {
            if (isChatHistoryTimeFilter(value)) {
              onFiltersChange({ ...filters, time: value });
            }
          }}
        >
          {TIME_FILTERS.map((time) => (
            <DropdownMenuRadioItem
              key={time}
              className={FILTER_MENU_ITEM_CLASS}
              value={time}
            >
              <span className={FILTER_MENU_TEXT_CLASS}>{timeLabel(time)}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className={FILTER_MENU_LABEL_CLASS}>
          <span className={FILTER_MENU_TEXT_CLASS}>
            {t("sidebar.filterWorkspace")}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          className={FILTER_MENU_GROUP_CLASS}
          value={filters.workspace}
          onValueChange={(value) => {
            onFiltersChange({
              ...filters,
              workspace: value as ChatHistoryWorkspaceFilter,
            });
          }}
        >
          <DropdownMenuRadioItem
            className={FILTER_MENU_ITEM_CLASS}
            value={CHAT_HISTORY_WORKSPACE_ALL}
          >
            <span className={FILTER_MENU_TEXT_CLASS}>
              {t("sidebar.filterWorkspaceAll")}
            </span>
          </DropdownMenuRadioItem>
          {hasNoWorkspaceSessions ? (
            <DropdownMenuRadioItem
              className={FILTER_MENU_ITEM_CLASS}
              value={CHAT_HISTORY_WORKSPACE_NONE}
            >
              <span className={FILTER_MENU_TEXT_CLASS}>
                {t("sidebar.filterWorkspaceNone")}
              </span>
            </DropdownMenuRadioItem>
          ) : null}
          {workspaceDirs.map((workspaceDir) => (
            <DropdownMenuRadioItem
              key={workspaceDir}
              className={FILTER_MENU_ITEM_CLASS}
              value={workspaceDir}
            >
              <span className={FILTER_MENU_TEXT_CLASS}>
                {getWorkspaceDisplayName(workspaceDir)}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        {hasActiveFilters ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className={cn(FILTER_MENU_ITEM_CLASS, "text-muted-foreground")}
              onClick={() =>
                onFiltersChange({
                  time: "all",
                  workspace: CHAT_HISTORY_WORKSPACE_ALL,
                })
              }
            >
              <span className={FILTER_MENU_TEXT_CLASS}>
                {t("sidebar.clearChatFilters")}
              </span>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
