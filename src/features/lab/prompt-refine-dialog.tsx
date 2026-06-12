import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { PROMPT_REFINE_TIMEOUT_MS } from "./refine-prompt";

type PromptRefineDialogProps = {
  open: boolean;
  originalText: string;
  refinedText: string;
  onConfirm: () => void;
  onCancel: () => void;
  onTimeout: () => void;
};

export function PromptRefineDialog({
  open,
  originalText,
  refinedText,
  onConfirm,
  onCancel,
  onTimeout,
}: PromptRefineDialogProps) {
  const { t } = useTranslation();
  const [countdownSeconds, setCountdownSeconds] = useState(
    Math.ceil(PROMPT_REFINE_TIMEOUT_MS / 1000)
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setCountdownSeconds(Math.ceil(PROMPT_REFINE_TIMEOUT_MS / 1000));

    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      const elapsedMs = Date.now() - startedAt;
      const remainingSeconds = Math.max(
        0,
        Math.ceil((PROMPT_REFINE_TIMEOUT_MS - elapsedMs) / 1000)
      );
      setCountdownSeconds(remainingSeconds);

      if (remainingSeconds <= 0) {
        window.clearInterval(intervalId);
        onTimeout();
      }
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [open, onTimeout]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
      }}
    >
      <DialogContent className="gap-5 sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("lab.confirmTitle")}</DialogTitle>
          <DialogDescription>
            {t("lab.confirmTimeout", { countdown: countdownSeconds })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t("lab.confirmOriginal")}
            </p>
            <div className="max-h-32 overflow-y-auto rounded-xl border bg-muted/30 px-3 py-2 text-sm whitespace-pre-wrap">
              {originalText}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t("lab.confirmRefined")}
            </p>
            <div className="max-h-40 overflow-y-auto rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm whitespace-pre-wrap">
              {refinedText}
            </div>
          </div>
        </div>

        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full origin-left rounded-full bg-primary/70"
            style={{
              animation: `prompt-refine-confirm-shrink ${PROMPT_REFINE_TIMEOUT_MS}ms linear forwards`,
            }}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("lab.cancel")}
          </Button>
          <Button type="button" onClick={onConfirm}>
            {t("lab.confirmSend")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
