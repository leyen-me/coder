"use client";

import {
  FileIcon,
  FilePlusIcon,
  FileXIcon,
  FileWarningIcon,
  GitBranchPlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

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
  onDiscard: (entry: GitStatusEntry) => void;
};

function ChangeFileItem({ entry, onToggle, onDiscard }: ChangeFileItemProps) {
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
      <div className="flex shrink-0 items-center gap-1">
        <span className="text-[10px] uppercase text-muted-foreground/60">
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
        <Button
          className="size-6 text-destructive/80 hover:text-destructive"
          onClick={() => onDiscard(entry)}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Trash2Icon className="size-3" />
        </Button>
      </div>
    </div>
  );
}

type DiscardTarget =
  | { type: "file"; path: string; entries: GitStatusEntry[] }
  | { type: "all" };

export function ChangesView() {
  const { t } = useTranslation();
  const {
    statusEntries,
    stageFiles,
    unstageFiles,
    stageAll,
    unstageAll,
    discardFiles,
    discardAll,
    isLoading,
  } = useGit();
  const [discardTarget, setDiscardTarget] = useState<DiscardTarget | null>(null);
  const [isDiscarding, setIsDiscarding] = useState(false);

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

  const discardDescription = useMemo(() => {
    if (!discardTarget) {
      return "";
    }
    return discardTarget.type === "file"
      ? t("git.discardFileConfirmDescription", { path: discardTarget.path })
      : t("git.discardAllConfirmDescription");
  }, [discardTarget, t]);

  const handleRequestDiscardFile = useCallback(
    (entry: GitStatusEntry) => {
      const matchingEntries = statusEntries.filter((candidate) => candidate.path === entry.path);
      setDiscardTarget({
        type: "file",
        path: entry.path,
        entries: matchingEntries.length > 0 ? matchingEntries : [entry],
      });
    },
    [statusEntries],
  );

  const handleConfirmDiscard = useCallback(async () => {
    if (!discardTarget) {
      return;
    }

    setIsDiscarding(true);
    try {
      if (discardTarget.type === "file") {
        await discardFiles(discardTarget.entries);
      } else {
        await discardAll();
      }
      setDiscardTarget(null);
    } catch {
      // Error handled in provider
    } finally {
      setIsDiscarding(false);
    }
  }, [discardAll, discardFiles, discardTarget]);

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
          {statusEntries.length > 0 ? (
            <Button
              className="ml-auto h-6 gap-1 text-[11px] text-destructive/90 hover:text-destructive"
              onClick={() => setDiscardTarget({ type: "all" })}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Trash2Icon className="size-3" />
              {t("git.discardAll")}
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
                onDiscard={handleRequestDiscardFile}
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
                onDiscard={handleRequestDiscardFile}
                onToggle={handleToggle}
              />
            ))}
          </div>
        ) : null}
      </div>

      <CommitBox />
      <AlertDialog open={discardTarget !== null} onOpenChange={(open) => !open && setDiscardTarget(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("git.discardConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{discardDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDiscarding}>{t("git.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDiscarding}
              onClick={() => void handleConfirmDiscard()}
            >
              {t("git.discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
