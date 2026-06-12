"use client";

import { forwardRef, useCallback, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import { useGit } from "../git-provider";

export const CommitBox = forwardRef<HTMLTextAreaElement>(
  function CommitBox(_props, ref) {
    const { t } = useTranslation();
    const { commit, statusEntries, isLoading } = useGit();
    const [message, setMessage] = useState("");
    const [isCommitting, setIsCommitting] = useState(false);

    const hasChanges = statusEntries.length > 0;
    const stagedCount = statusEntries.filter((entry) => entry.staged).length;
    const canCommit = message.trim().length > 0 && stagedCount > 0 && !isCommitting;

    const handleCommit = useCallback(async () => {
      if (!canCommit) return;
      setIsCommitting(true);
      try {
        await commit(message.trim());
        setMessage("");
      } catch {
        // Error is set in the provider
      } finally {
        setIsCommitting(false);
      }
    }, [canCommit, commit, message]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && canCommit) {
          e.preventDefault();
          void handleCommit();
        }
      },
      [canCommit, handleCommit],
    );

    return (
      <div className="shrink-0 border-t bg-background/95 p-3 backdrop-blur">
        <div className="rounded-xl border bg-muted/20 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("git.commit")}</p>
              <p className="text-[11px] text-muted-foreground">
                {stagedCount > 0
                  ? t("git.readyToCommit", { count: stagedCount })
                  : hasChanges
                    ? t("git.stageChangesToCommit")
                    : t("git.workingTreeClean")}
              </p>
            </div>
            <Badge
              className={cn("shrink-0", stagedCount === 0 && "text-muted-foreground")}
              variant={stagedCount > 0 ? "default" : "outline"}
            >
              {t("git.stagedChanges")} {stagedCount}
            </Badge>
          </div>
          <div className="flex flex-col gap-2">
            <Textarea
              className="min-h-[72px] resize-none border-border/60 bg-background text-xs"
              disabled={!hasChanges || isLoading}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("git.commitMessagePlaceholder")}
              ref={ref}
              rows={3}
              value={message}
            />
            <Button
              className="w-full text-xs"
              disabled={!canCommit}
              onClick={handleCommit}
              size="sm"
              type="button"
            >
              {isCommitting ? t("git.operationInProgress") : t("git.commit")}
            </Button>
          </div>
        </div>
      </div>
    );
  },
);
