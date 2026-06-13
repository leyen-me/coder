"use client";

import {
  FileIcon,
  FilePlusIcon,
  FileXIcon,
  FileWarningIcon,
  GitBranchPlusIcon,
  InboxIcon,
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
        "group flex min-w-0 items-start gap-2 px-3 py-2 transition-colors hover:bg-muted/40",
        entry.staged && "bg-primary/5",
      )}
    >
      <Checkbox
        checked={entry.staged}
        className="size-3.5"
        onCheckedChange={() => onToggle(entry.path, entry.staged)}
      />
      <div className="rounded-lg bg-muted/50 p-1.5">
        <Icon className={cn("size-3.5 shrink-0", STATUS_COLORS[entry.status])} />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="wrap-anywhere text-xs leading-4 font-mono">{entry.path}</p>
        {entry.originalPath ? (
          <p className="wrap-anywhere pt-0.5 text-[11px] leading-4 text-muted-foreground">
            {entry.originalPath}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1 pl-1">
        <span className={cn("text-[10px] font-medium", STATUS_COLORS[entry.status])}>
          {entry.status.slice(0, 1).toUpperCase()}
        </span>
        <Button
          aria-label={entry.path}
          className="text-destructive/80 hover:text-destructive"
          onClick={() => onDiscard(entry)}
          size="icon-xs"
          title={entry.path}
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

type ChangeSectionProps = {
  entries: GitStatusEntry[];
  title: string;
  onDiscard: (entry: GitStatusEntry) => void;
  onToggle: (path: string, staged: boolean) => void;
};

function ChangeSection({ entries, title, onDiscard, onToggle }: ChangeSectionProps) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-background shadow-xs">
      <div className="border-b px-3 py-2">
        <p className="truncate text-xs font-medium">{title}</p>
      </div>
      <div className="divide-y divide-border/60">
        {entries.map((entry) => (
          <ChangeFileItem
            entry={entry}
            key={`${entry.staged ? "staged" : "unstaged"}-${entry.path}-${entry.status}`}
            onDiscard={onDiscard}
            onToggle={onToggle}
          />
        ))}
      </div>
    </section>
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
      <div className="flex h-full flex-col bg-muted/10">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
          <InboxIcon className="size-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">{t("git.noChanges")}</p>
        </div>
        <CommitBox />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-muted/10">
      <div className="shrink-0 border-b bg-background/80 px-3 py-2">
        <div className="flex justify-end gap-1">
          {unstagedEntries.length > 0 ? (
            <Button
              aria-label={t("git.stagedFiles")}
              onClick={() => void stageAll()}
              size="icon-xs"
              title={t("git.stagedFiles")}
              type="button"
              variant="outline"
            >
              <GitBranchPlusIcon className="size-3" />
            </Button>
          ) : null}
          {stagedEntries.length > 0 ? (
            <Button
              aria-label={t("git.unstagedFiles")}
              onClick={() => void unstageAll()}
              size="icon-xs"
              title={t("git.unstagedFiles")}
              type="button"
              variant="outline"
            >
              <RotateCcwIcon className="size-3" />
            </Button>
          ) : null}
          {statusEntries.length > 0 ? (
            <Button
              aria-label={t("git.discardAll")}
              className="text-destructive/90 hover:text-destructive"
              onClick={() => setDiscardTarget({ type: "all" })}
              size="icon-xs"
              title={t("git.discardAll")}
              type="button"
              variant="ghost"
            >
              <Trash2Icon className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="flex flex-col gap-3 p-3">
          <ChangeSection
            entries={stagedEntries}
            onDiscard={handleRequestDiscardFile}
            onToggle={handleToggle}
            title={t("git.stagedChanges")}
          />
          <ChangeSection
            entries={unstagedEntries}
            onDiscard={handleRequestDiscardFile}
            onToggle={handleToggle}
            title={t("git.unstagedChanges")}
          />
        </div>
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
