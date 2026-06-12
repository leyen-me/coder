"use client";

import { CopyIcon, GitCommitIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import { useGit } from "../git-provider";
import { EmptyState } from "./empty-state";

type HistoryViewProps = {
  workspaceDir: string | null;
};

const LOAD_MORE_THRESHOLD_PX = 160;

export function HistoryView({ workspaceDir: _workspaceDir }: HistoryViewProps) {
  const { t } = useTranslation();
  const {
    recentCommits,
    isLoading,
    hasMoreRecentCommits,
    isLoadingMoreRecentCommits,
    loadMoreRecentCommits,
  } = useGit();
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const copyToClipboard = useCallback(async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHash(hash);
      window.setTimeout(() => setCopiedHash(null), 1500);
    } catch {
      // Clipboard not available
    }
  }, []);

  const maybeLoadMore = useCallback(() => {
    const container = scrollAreaRef.current;
    if (
      !container ||
      !hasMoreRecentCommits ||
      isLoadingMoreRecentCommits ||
      isLoading
    ) {
      return;
    }

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom <= LOAD_MORE_THRESHOLD_PX) {
      void loadMoreRecentCommits();
    }
  }, [
    hasMoreRecentCommits,
    isLoadingMoreRecentCommits,
    isLoading,
    loadMoreRecentCommits,
  ]);

  useEffect(() => {
    maybeLoadMore();
  }, [maybeLoadMore, recentCommits.length]);

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
    <div ref={scrollAreaRef} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div
        className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
        onScroll={maybeLoadMore}
      >
        <div className="flex min-w-0 flex-col gap-1 p-2">
          {recentCommits.map((commit) => (
            <div
              key={commit.hash}
              className="flex min-w-0 w-full flex-col gap-1 rounded-md border p-2 transition-colors hover:bg-muted/20"
            >
              <div className="flex min-w-0 items-start gap-2">
                <GitCommitIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium" title={commit.message}>
                    {commit.message}
                  </p>
                  <p
                    className="truncate text-[10px] text-muted-foreground"
                    title={`${commit.authorName} · ${formatDistanceToNow(commit.timestamp * 1000, {
                      addSuffix: true,
                    })}`}
                  >
                    {commit.authorName} ·{" "}
                    {formatDistanceToNow(commit.timestamp * 1000, {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </div>
              <div className="flex min-w-0 items-center gap-1.5">
                <button
                  className={cn(
                    "group/btn inline-flex shrink-0 items-center gap-1 rounded px-1 font-mono text-[10px] text-muted-foreground/60 transition-colors hover:text-foreground",
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
              </div>
            </div>
          ))}
          {hasMoreRecentCommits ? (
            <div className="flex min-h-8 items-center justify-center py-1 text-[10px] text-muted-foreground">
              {isLoadingMoreRecentCommits
                ? t("git.loadingMoreHistory")
                : t("git.loadMoreWhenScrolled")}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
