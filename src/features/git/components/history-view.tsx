"use client";

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
import { CopyIcon, GitCommitIcon, Undo2Icon } from "lucide-react";
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
    aheadCount,
    isLoading,
    hasMoreRecentCommits,
    isLoadingMoreRecentCommits,
    loadMoreRecentCommits,
    revertCommit,
  } = useGit();
  /** Number of unpushed commits at the top of the list. */
  const unpushedCount = Math.min(aheadCount, recentCommits.length);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [revertTarget, setRevertTarget] = useState<{
    hash: string;
    shortHash: string;
  } | null>(null);
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
    <div ref={scrollAreaRef} className="flex min-h-0 min-w-0 flex-1 flex-col bg-muted/10">
      <div
        className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
        onScroll={maybeLoadMore}
      >
        <div className="flex min-w-0 flex-col gap-3 p-3">
          {recentCommits.map((commit, index) => {
            const isUnpushed = index < unpushedCount;

            const card = (
              <div
                key={commit.hash}
                className={cn(
                  "flex min-w-0 w-full flex-col gap-2 rounded-xl border bg-background p-3 shadow-xs transition-colors hover:bg-muted/20",
                  !isUnpushed && "opacity-60",
                )}
              >
                <div className="flex min-w-0 items-start gap-2">
                  <div
                    className={cn(
                      "rounded-lg p-1.5",
                      isUnpushed ? "bg-primary/10" : "bg-muted/50",
                    )}
                  >
                    <GitCommitIcon
                      className={cn(
                        "size-3.5 shrink-0",
                        isUnpushed ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "truncate text-xs font-medium",
                        isUnpushed
                          ? "text-foreground"
                          : "text-muted-foreground",
                      )}
                      title={commit.message}
                    >
                      {commit.message}
                    </p>
                    <p
                      className="truncate text-[10px] text-muted-foreground"
                      title={`${commit.authorName} · ${formatDistanceToNow(commit.timestamp * 1000, { addSuffix: true })}`}
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
                  <button
                    className="ml-auto inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground/60 transition-colors hover:text-destructive hover:bg-destructive/10"
                    onClick={() =>
                      setRevertTarget({
                        hash: commit.hash,
                        shortHash: commit.hash.slice(0, 7),
                      })
                    }
                    title={t("git.revertButton")}
                    type="button"
                  >
                    <Undo2Icon className="size-3" />
                    <span>{t("git.revertButton")}</span>
                  </button>
                </div>
              </div>
            );

            return card;
          })}
          {hasMoreRecentCommits ? (
            <div className="flex min-h-8 items-center justify-center py-1 text-[10px] text-muted-foreground">
              {isLoadingMoreRecentCommits
                ? t("git.loadingMoreHistory")
                : t("git.loadMoreWhenScrolled")}
            </div>
          ) : null}
        </div>
      </div>

      <AlertDialog
        open={revertTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevertTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("git.revertConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {revertTarget
                ? t("git.revertConfirmDescription", {
                    shortHash: revertTarget.shortHash,
                  })
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("git.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (!revertTarget) return;
                const hash = revertTarget.hash;
                setRevertTarget(null);
                try {
                  await revertCommit(hash);
                } catch {
                  // error is handled by the provider
                }
              }}
            >
              {t("git.revertButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
