"use client";

import { forwardRef, useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { useGit } from "../git-provider";

export const CommitBox = forwardRef<HTMLTextAreaElement>(
  function CommitBox(_props, ref) {
    const { t } = useTranslation();
    const { commit, statusEntries, isLoading } = useGit();
    const [message, setMessage] = useState("");
    const [isCommitting, setIsCommitting] = useState(false);

    const hasChanges = statusEntries.length > 0;
    const canCommit = message.trim().length > 0 && hasChanges && !isCommitting;

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
      <div className="flex shrink-0 flex-col gap-2 border-t p-3">
        <Textarea
          disabled={!hasChanges || isLoading}
          onKeyDown={handleKeyDown}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("git.commitMessagePlaceholder")}
          ref={ref}
          rows={2}
          value={message}
          className="min-h-0 resize-none text-xs"
        />
        <Button
          disabled={!canCommit}
          onClick={handleCommit}
          size="sm"
          type="button"
          className="h-7 w-full text-xs"
        >
          {isCommitting ? t("git.operationInProgress") : t("git.commit")}
        </Button>
      </div>
    );
  },
);
