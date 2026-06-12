"use client";

import {
  FileIcon,
  FilePlusIcon,
  FileXIcon,
  FileWarningIcon,
  GitBranchPlusIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import { useGit } from "../git-provider";
import type { GitFileStatus, GitStatusEntry } from "../types";
import { CommitBox } from "./commit-box";

const STATUS_ICONS: Record<GitFileStatus, React.ComponentType<{ className?: string }>> = {
  modified: FileIcon,
  added: FilePlusIcon,
  deleted: FileXIcon,
  renamed: FilePlusIcon,
  copied: FilePlusIcon,
  untracked: FilePlusIcon,
  conflicted: FileWarningIcon,
  type_changed: FileIcon,
};

const STATUS_COLORS: Record<GitFileStatus, string> = {
  modified: "text-amber-500",
  added: "text-green-500",
  deleted: "text-red-500",
  renamed: "text-green-500",
  copied: "text-green-500",
  untracked: "text-green-500",
  conflicted: "text-red-500",
  type_changed: "text-amber-500",
};

type ChangeFileItemProps = {
  entry: GitStatusEntry;
  onToggle: (path: string, staged: boolean) => void;
};

function ChangeFileItem({ entry, onToggle }: ChangeFileItemProps) {
  const Icon = STATUS_ICONS[entry.status] ?? FileIcon;

  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-3 py-1 text-xs transition-colors hover:bg-muted/30",
        entry.staged && "bg-muted/10",
      )}
    >
      <Checkbox
        checked={entry.staged}
        className="size-3.5"
        onCheckedChange={() => onToggle(entry.path, entry.staged)}
      />
      <Icon className={cn("size-3.5 shrink-0", STATUS_COLORS[entry.status])} />
      <span className="min-w-0 flex-1 truncate font-mono">{entry.path}</span>
      <span className="shrink-0 text-[10px] uppercase text-muted-foreground/60">
        {entry.status === "modified"
          ? "M"
          : entry.status === "added"
            ? "A"
            : entry.status === "deleted"
              ? "D"
              : entry.status === "renamed"
                ? "R"
                : entry.status === "conflicted"
                  ? "C"
                  : entry.status === "untracked"
                    ? "U"
                    : ""}
      </span>
    </div>
  );
}

export function ChangesView() {
  const { t } = useTranslation();
  const {
    statusEntries,
    stageFiles,
    unstageFiles,
    stageAll,
    unstageAll,
    isLoading,
  } = useGit();

  const handleToggle = useCallback(
    (path: string, currentlyStaged: boolean) => {
      if (currentlyStaged) {
        void unstageFiles([path]);
      } else {
        void stageFiles([path]);
      }
    },
    [stageFiles, unstageFiles],
  );

  const unstagedEntries = statusEntries.filter((e) => !e.staged);
  const stagedEntries = statusEntries.filter((e) => e.staged);

  if (isLoading && statusEntries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("git.loading")}
      </div>
    );
  }

  if (statusEntries.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {t("git.noChanges")}
        </div>
        <CommitBox />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        {/* Stage/Unstage All buttons */}
        <div className="flex items-center gap-1 border-b px-2 py-1">
          {unstagedEntries.length > 0 ? (
            <Button
              className="h-6 gap-1 text-[11px]"
              onClick={() => void stageAll()}
              size="sm"
              type="button"
              variant="ghost"
            >
              <GitBranchPlusIcon className="size-3" />
              {t("git.stagedFiles")}
            </Button>
          ) : null}
          {stagedEntries.length > 0 ? (
            <Button
              className="h-6 gap-1 text-[11px]"
              onClick={() => void unstageAll()}
              size="sm"
              type="button"
              variant="ghost"
            >
              <RotateCcwIcon className="size-3" />
              {t("git.unstagedFiles")}
            </Button>
          ) : null}
        </div>

        {/* Staged changes */}
        {stagedEntries.length > 0 ? (
          <div>
            <div className="sticky top-0 bg-background px-3 py-1 text-[11px] font-medium uppercase text-muted-foreground/70">
              {t("git.stagedChanges")} ({stagedEntries.length})
            </div>
            {stagedEntries.map((entry) => (
              <ChangeFileItem
                entry={entry}
                key={`staged-${entry.path}`}
                onToggle={handleToggle}
              />
            ))}
          </div>
        ) : null}

        {/* Unstaged changes */}
        {unstagedEntries.length > 0 ? (
          <div>
            <div className="sticky top-0 bg-background px-3 py-1 text-[11px] font-medium uppercase text-muted-foreground/70">
              {t("git.unstagedChanges")} ({unstagedEntries.length})
            </div>
            {unstagedEntries.map((entry) => (
              <ChangeFileItem
                entry={entry}
                key={`unstaged-${entry.path}`}
                onToggle={handleToggle}
              />
            ))}
          </div>
        ) : null}
      </div>

      <CommitBox />
    </div>
  );
}
