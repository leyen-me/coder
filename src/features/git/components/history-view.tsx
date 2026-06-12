"use client";

import { CopyIcon, GitCommitIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useCallback, useState } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import { useGit } from "../git-provider";
import { EmptyState } from "./empty-state";

type HistoryViewProps = {
  workspaceDir: string | null;
};

export function HistoryView({ workspaceDir: _workspaceDir }: HistoryViewProps) {
  const { t } = useTranslation();
  const { recentCommits, isLoading } = useGit();
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const copyToClipboard = useCallback(async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHash(hash);
      window.setTimeout(() => setCopiedHash(null), 1500);
    } catch {
      // Clipboard not available
    }
  }, []);

  if (isLoading && recentCommits.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("git.loading")}
      </div>
    );
  }

  if (recentCommits.length === 0) {
    return <EmptyState message={t("git.noChanges")} />;
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-1 p-2">
        {recentCommits.map((commit) => (
          <div
            key={commit.hash}
            className="flex flex-col gap-1 rounded-md border p-2 transition-colors hover:bg-muted/20"
          >
            <div className="flex items-start gap-2">
              <GitCommitIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{commit.message}</p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {commit.authorName} ·{" "}
                  {formatDistanceToNow(commit.timestamp * 1000, {
                    addSuffix: true,
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                className={cn(
                  "group/btn inline-flex items-center gap-1 rounded px-1 font-mono text-[10px] text-muted-foreground/60 transition-colors hover:text-foreground",
                  copiedHash === commit.hash && "text-primary",
                )}
                onClick={() => void copyToClipboard(commit.hash)}
                title={commit.hash}
                type="button"
              >
                <span>{commit.hash.slice(0, 7)}</span>
                <CopyIcon
                  className={cn(
                    "size-2.5 opacity-0 transition-opacity group-hover/btn:opacity-100",
                    copiedHash === commit.hash && "opacity-100",
                  )}
                />
              </button>
              {copiedHash === commit.hash ? (
                <span className="text-[9px] text-primary">Copied</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
