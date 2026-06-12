"use client";

import { GitCommitIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { useGit } from "../git-provider";
import { EmptyState } from "./empty-state";

type HistoryViewProps = {
  workspaceDir: string | null;
};

export function HistoryView({ workspaceDir: _workspaceDir }: HistoryViewProps) {
  const { t } = useTranslation();
  const { recentCommits, isLoading } = useGit();

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
            <p className="font-mono text-[10px] text-muted-foreground/60">
              {commit.hash.slice(0, 7)}
            </p>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
