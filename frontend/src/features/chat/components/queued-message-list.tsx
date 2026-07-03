import { ChevronDownIcon, ListOrderedIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import type { QueuedMessage } from "../lib/message-queue";

type QueuedMessageListProps = {
  messages: readonly QueuedMessage[];
  editingMessageId?: string | null;
  onEdit: (message: QueuedMessage) => void;
  onDelete: (messageId: string) => void;
};

export function QueuedMessageList({
  messages,
  editingMessageId = null,
  onEdit,
  onDelete,
}: QueuedMessageListProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (messages.length === 0) {
    return null;
  }

  const nextMessage = messages[0] ?? null;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="mb-2 overflow-hidden rounded-2xl border bg-muted/30"
    >
      <CollapsibleTrigger
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
        aria-label={open ? t("chat.queueCollapse") : t("chat.queueExpand")}
      >
        <ListOrderedIcon className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">{t("chat.queueTitle")}</p>
          <p className="text-muted-foreground text-xs">
            {t("chat.queueCount", { count: messages.length })}
          </p>
        </div>
        {!open && nextMessage ? (
          <span className="max-w-[36%] truncate text-muted-foreground text-xs">
            {nextMessage.text || t("chat.queueAttachmentOnly")}
          </span>
        ) : null}
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open ? "rotate-180" : "rotate-0"
          )}
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="border-t">
        <div className="divide-y">
          {messages.map((message, index) => {
            const isEditing = editingMessageId === message.id;
            const attachmentCount = message.files.length;

            return (
              <div
                className={cn(
                  "flex items-start gap-3 px-3 py-2.5",
                  isEditing && "bg-accent/50"
                )}
                key={message.id}
              >
                <div className="mt-0.5 shrink-0 rounded-full bg-secondary px-2 py-0.5 font-medium text-[11px] text-secondary-foreground">
                  {index + 1}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 whitespace-pre-wrap wrap-break-word text-sm">
                    {message.text || t("chat.queueAttachmentOnly")}
                  </p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {attachmentCount > 0
                      ? t("chat.queueWaitingWithAttachments", {
                          count: attachmentCount,
                        })
                      : t("chat.queueWaiting")}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    aria-label={t("chat.queueEdit")}
                    className="h-8 w-8 rounded-full"
                    onClick={() => {
                      onEdit(message);
                    }}
                    size="icon"
                    title={t("chat.queueEdit")}
                    type="button"
                    variant="ghost"
                  >
                    <PencilIcon className="size-3.5" />
                  </Button>
                  <Button
                    aria-label={t("chat.queueDelete")}
                    className="h-8 w-8 rounded-full"
                    onClick={() => {
                      onDelete(message.id);
                    }}
                    size="icon"
                    title={t("chat.queueDelete")}
                    type="button"
                    variant="ghost"
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
