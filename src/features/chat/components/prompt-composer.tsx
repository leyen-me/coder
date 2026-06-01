import type { KeyboardEvent } from "react";
import {
  ArrowUp,
  ChevronDown,
  Loader2,
  Plus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

type PromptComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend?: () => void;
  onStop?: () => void;
  model: string;
  models: readonly string[];
  onModelChange: (model: string) => void;
  variant?: "full" | "compact";
  isRunning?: boolean;
  className?: string;
};

export function PromptComposer({
  value,
  onChange,
  onSend,
  onStop,
  model,
  models,
  onModelChange,
  variant = "full",
  isRunning = false,
  className,
}: PromptComposerProps) {
  const { t } = useTranslation();
  const canSend = value.trim().length > 0;
  const isCompact = variant === "compact";

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (isRunning) {
        return;
      }
      if (canSend) {
        onSend?.();
      }
    }
  };

  return (
    <Card
      className={cn(
        "w-full max-w-3xl gap-0 overflow-hidden rounded-3xl py-0 ring-1 ring-border",
        isCompact && "shadow-lg",
        className
      )}
    >
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("chat.composerPlaceholder")}
        className={cn(
          "resize-none rounded-none border-0 bg-transparent px-4 py-4 text-base shadow-none focus-visible:ring-0",
          isCompact ? "min-h-[72px]" : "min-h-[120px]"
        )}
      />

      <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
        <div className="flex items-center gap-1">
          {!isCompact ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-xl text-muted-foreground"
              aria-label={t("chat.addAttachment")}
            >
              <Plus className="size-4" />
            </Button>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="max-w-40 gap-1 truncate rounded-xl text-muted-foreground"
                disabled={isRunning}
              >
                <span className="truncate">{model || t("chat.noModel")}</span>
                <ChevronDown className="size-3.5 shrink-0 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {models.map((item) => (
                <DropdownMenuItem
                  key={item}
                  onClick={() => onModelChange(item)}
                >
                  {item}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {isRunning ? (
            <Button
              type="button"
              size="icon"
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              onClick={onStop}
              aria-label={t("chat.stop")}
            >
              <Loader2 className="size-4 animate-spin" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              disabled={!canSend}
              onClick={onSend}
              aria-label={t("chat.send")}
            >
              <ArrowUp className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
