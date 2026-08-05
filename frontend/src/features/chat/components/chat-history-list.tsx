import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Download, FileJson, Pencil, Pin, PinOff, Trash2 } from "lucide-react";

import { paths } from "@/app/paths";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import { SessionTitleLabel } from "@/features/chat/components/session-title-label";
import type { ChatHistoryItem } from "@/lib/db";
import type { MessageKey } from "@/lib/i18n/message-schema";

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
  onDeleteSession: (sessionId: string) => void;
  onExportSession: (sessionId: string) => void;
  onExportSessionJson: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onPinSession?: (sessionId: string) => void;
  onUnpinSession?: (sessionId: string) => void;
};

type RenameState = {
  sessionId: string;
  title: string;
};

export function ChatHistoryList({
  items,
  selectedId,
  generatingTitleIds,
  runningSessionIds,
  onDeleteSession,
  onExportSession,
  onExportSessionJson,
  onRenameSession,
  onPinSession,
  onUnpinSession,
}: ChatHistoryListProps) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState(DEFAULT_CHAT_HISTORY_FILTERS);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [renameState, setRenameState] = useState<RenameState | null>(null);

  const filteredItems = useMemo(() => {
    const filtered = filterChatHistoryItems(items, filters);
    // Deduplicate by id to prevent React key warnings in case the source
    // data contains duplicates (e.g. due to a race condition in the DB).
    const seen = new Map<string, ChatHistoryItem>();
    for (const item of filtered) {
      seen.set(item.id, item);
    }
    return [...seen.values()];
  }, [items, filters]);
  const hasActiveFilters = isChatHistoryFiltersActive(filters);
  const showNoMatches =
    hasActiveFilters && items.length > 0 && filteredItems.length === 0;

  return (
    <>
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
                const isGeneratingTitle =
                  generatingTitleIds?.has(item.id) ?? false;
                const isRunning =
                  runningSessionIds?.has(item.id) ?? false;

                return (
                  <ContextMenu key={item.id}>
                    <ContextMenuTrigger asChild>
                      <li className="min-w-0">
                        <Link
                          to={paths.chat(item.id)}
                          className={cn(
                            "grid w-full min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition-colors hover:bg-sidebar-accent",
                            isRunning || (!isRunning && item.pinnedAt)
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
                          {!isRunning && item.pinnedAt ? (
                            <Pin className="size-3 shrink-0 text-muted-foreground" />
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
                    </ContextMenuTrigger>
                    <ContextMenuContent side="right">
                      <ContextMenuItem
                        onClick={() =>
                          setRenameState({
                            sessionId: item.id,
                            title: item.title,
                          })
                        }
                      >
                        <Pencil className="size-4" />
                        {t("sidebar.editChat")}
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => onExportSession(item.id)}>
                        <Download className="size-4" />
                        {t("sidebar.exportChat")}
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => onExportSessionJson(item.id)}>
                        <FileJson className="size-4" />
                        {t("sidebar.exportChatJson")}
                      </ContextMenuItem>
                      {!isRunning && onPinSession && onUnpinSession && (
                        <ContextMenuItem
                          onClick={() =>
                            item.pinnedAt
                              ? onUnpinSession(item.id)
                              : onPinSession(item.id)
                          }
                        >
                          {item.pinnedAt ? (
                            <PinOff className="size-4" />
                          ) : (
                            <Pin className="size-4" />
                          )}
                          {item.pinnedAt
                            ? t("sidebar.unpinChat")
                            : t("sidebar.pinChat")}
                        </ContextMenuItem>
                      )}
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        variant="destructive"
                        onClick={() => setSessionToDelete(item.id)}
                      >
                        <Trash2 className="size-4" />
                        {t("sidebar.deleteChat")}
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </div>

      {/* Rename dialog */}
      <RenameDialog
        renameState={renameState}
        onClose={() => setRenameState(null)}
        onSave={(sessionId, title) => {
          onRenameSession(sessionId, title);
          setRenameState(null);
        }}
        t={t}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={sessionToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setSessionToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("sidebar.deleteChatConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("sidebar.deleteChatConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("settings.data.confirmCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (sessionToDelete) {
                  onDeleteSession(sessionToDelete);
                  setSessionToDelete(null);
                }
              }}
            >
              {t("sidebar.deleteChat")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function RenameDialog({
  renameState,
  onClose,
  onSave,
  t,
}: {
  renameState: RenameState | null;
  onClose: () => void;
  onSave: (sessionId: string, title: string) => void;
  t: (key: MessageKey) => string;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renameState) {
      setValue(renameState.title);
      // Focus the input after the dialog opens
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [renameState]);

  const handleSave = () => {
    const trimmed = value.trim();
    if (trimmed && renameState) {
      onSave(renameState.sessionId, trimmed);
    }
  };

  return (
    <Dialog
      open={renameState !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("sidebar.editChatTitle")}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label={t("sidebar.editChatTitleLabel")}
            className="mb-4"
          />
          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-2xl border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              {t("settings.data.confirmCancel")}
            </button>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              disabled={!value.trim()}
            >
              {t("sidebar.editChatTitleSave")}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
