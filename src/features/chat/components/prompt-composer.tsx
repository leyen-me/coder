import type { ChatStatus } from "ai";
import { PlusIcon } from "lucide-react";
import { useCallback } from "react";

import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
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

function resolveSubmitStatus(
  isRunning: boolean,
  hasStopHandler: boolean
): ChatStatus {
  if (!isRunning) {
    return "ready";
  }

  return hasStopHandler ? "streaming" : "submitted";
}

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
  const isCompact = variant === "compact";
  const canSend = value.trim().length > 0;
  const submitStatus = resolveSubmitStatus(isRunning, Boolean(onStop));

  const handleSubmit = useCallback(
    (_message: PromptInputMessage) => {
      if (isRunning || !canSend) {
        return;
      }

      onSend?.();
    },
    [canSend, isRunning, onSend]
  );

  return (
    <PromptInput
      className={cn(
        "w-full max-w-3xl",
        // Match previous Card styling: solid surface, no stacked translucent layers.
        "[&_[data-slot=input-group]]:h-auto [&_[data-slot=input-group]]:overflow-hidden",
        "[&_[data-slot=input-group]]:rounded-3xl",
        "[&_[data-slot=input-group]]:border-border [&_[data-slot=input-group]]:bg-card",
        "[&_[data-slot=input-group]]:text-card-foreground [&_[data-slot=input-group]]:shadow-none",
        "[&_[data-slot=input-group]]:dark:bg-card [&_[data-slot=input-group]]:has-disabled:opacity-100",
        "[&_[data-slot=input-group]]:has-[[data-slot=input-group-control]:focus-visible]:ring-2",
        "[&_[data-slot=input-group]]:has-[[data-slot=input-group-control]:focus-visible]:ring-ring/25",
        "[&_[data-slot=input-group-control]]:text-foreground",
        "[&_[data-slot=input-group-control]]:disabled:cursor-not-allowed",
        "[&_[data-slot=input-group-control]]:disabled:opacity-100",
        isCompact && "[&_[data-slot=input-group]]:shadow-md",
        className
      )}
      onSubmit={handleSubmit}
    >
      <PromptInputBody>
        <PromptInputTextarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t("chat.composerPlaceholder")}
          className={cn(
            "px-4 py-4 text-base text-foreground",
            isCompact ? "min-h-[72px]" : "min-h-[120px]"
          )}
          readOnly={isRunning}
        />
      </PromptInputBody>

      <PromptInputFooter className="border-t border-border/60 bg-card px-3 py-2">
        <PromptInputTools>
          {!isCompact ? (
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger
                aria-label={t("chat.addAttachment")}
                className="shrink-0 rounded-xl"
                disabled={isRunning}
                variant="ghost"
              >
                <PlusIcon className="size-4" />
              </PromptInputActionMenuTrigger>
              <PromptInputActionMenuContent align="start">
                <PromptInputActionAddAttachments
                  label={t("chat.addAttachment")}
                />
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
          ) : null}

          <PromptInputSelect
            value={model}
            onValueChange={onModelChange}
            disabled={isRunning || models.length === 0}
          >
            <PromptInputSelectTrigger
              className="h-8 max-w-56 rounded-xl px-2.5 [&_[data-slot=select-value]]:truncate"
              title={model || undefined}
            >
              <PromptInputSelectValue placeholder={t("chat.noModel")} />
            </PromptInputSelectTrigger>
            <PromptInputSelectContent align="end" className="max-w-sm">
              {models.map((item) => (
                <PromptInputSelectItem key={item} value={item}>
                  {item}
                </PromptInputSelectItem>
              ))}
            </PromptInputSelectContent>
          </PromptInputSelect>
        </PromptInputTools>

        <PromptInputSubmit
          className="shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90"
          disabled={!canSend && !isRunning}
          onStop={onStop}
          status={submitStatus}
        />
      </PromptInputFooter>
    </PromptInput>
  );
}
