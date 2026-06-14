"use client";

import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
} from "@/components/ai-elements/file-tree";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ListDirEntry } from "@/features/agent/tools/types";
import { createFileTreePointerDragProps } from "@/lib/dnd/workspace-path-pointer";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";
import {
  EyeIcon,
  EyeOffIcon,
  FilesIcon,
  RefreshCwIcon,
} from "lucide-react";
import { forwardRef, useCallback, useImperativeHandle } from "react";

import {
  FileTreeDeleteDialog,
  FileTreeNameDialog,
} from "./file-tree-dialogs";
import {
  FileTreeBlankContextMenu,
  FileTreeEntryContextMenu,
} from "./file-tree-context-menu";
import type { FilePreviewTab } from "../hooks/use-file-preview-tabs";
import { useFileTreeActions } from "../hooks/use-file-tree-actions";
import { useWorkspaceFileTree } from "../hooks/use-workspace-file-tree";
import { ROOT_PATH } from "../lib/workspace-path-utils";

type WorkspaceFileTreeProps = {
  workspaceDir: string | null;
  className?: string;
  onFileOpen?: (file: FilePreviewTab) => void;
  onFileClose?: (path: string) => void;
  onFileRename?: (oldPath: string, file: FilePreviewTab) => void;
  openPreviewPaths?: Set<string>;
};

export type WorkspaceFileTreeHandle = {
  refreshAll: () => void;
};

function findTreeEntry(
  path: string,
  entriesByPath: Map<string, ListDirEntry[]>
): ListDirEntry | null {
  for (const entries of entriesByPath.values()) {
    const entry = entries.find((item) => item.path === path);
    if (entry) {
      return entry;
    }
  }

  return null;
}

type RenderTreeEntriesOptions = {
  entries: ListDirEntry[];
  entriesByPath: Map<string, ListDirEntry[]>;
  actions: ReturnType<typeof useFileTreeActions>;
  isExpanded: (path: string) => boolean;
  toggleExpanded: (path: string) => void;
  onRefresh: () => void;
};

function renderTreeEntries({
  entries,
  entriesByPath,
  actions,
  isExpanded,
  toggleExpanded,
  onRefresh,
}: RenderTreeEntriesOptions) {
  return entries.map((entry) => {
    const pointerDragProps = createFileTreePointerDragProps({
      isDir: entry.isDir,
      name: entry.name,
      path: entry.path,
    });

    if (entry.isDir) {
      const children = entriesByPath.get(entry.path) ?? [];

      return (
        <FileTreeEntryContextMenu
          key={entry.path}
          actions={actions}
          entry={entry}
          isExpanded={isExpanded(entry.path)}
          onRefresh={onRefresh}
          onToggleExpanded={() => toggleExpanded(entry.path)}
        >
          <FileTreeFolder name={entry.name} path={entry.path} {...pointerDragProps}>
            {children.length > 0
              ? renderTreeEntries({
                  entries: children,
                  entriesByPath,
                  actions,
                  isExpanded,
                  toggleExpanded,
                  onRefresh,
                })
              : null}
          </FileTreeFolder>
        </FileTreeEntryContextMenu>
      );
    }

    return (
      <FileTreeEntryContextMenu
        key={entry.path}
        actions={actions}
        entry={entry}
        isExpanded={false}
        onToggleExpanded={() => {}}
      >
        <FileTreeFile
          className="cursor-grab active:cursor-grabbing"
          name={entry.name}
          path={entry.path}
          {...pointerDragProps}
        />
      </FileTreeEntryContextMenu>
    );
  });
}

export const WorkspaceFileTree = forwardRef<
  WorkspaceFileTreeHandle,
  WorkspaceFileTreeProps
>(function WorkspaceFileTree(
  {
    workspaceDir,
    className,
    onFileOpen,
    onFileClose,
    onFileRename,
    openPreviewPaths,
  },
  ref
) {
  const { t } = useTranslation();
  const tree = useWorkspaceFileTree(workspaceDir);
  const actions = useFileTreeActions({
    workspaceDir,
    tree,
    onFileOpen,
    onFileClose,
    onFileRename,
    openPreviewPaths,
  });

  const rootEntries = tree.rootPath
    ? (tree.entriesByPath.get(tree.rootPath) ?? [])
    : [];
  const isInitialLoad =
    tree.loading && !tree.entriesByPath.has(ROOT_PATH);

  const nameDialogMode = actions.nameDialog?.mode ?? null;
  const nameDialogDefaultName = actions.nameDialog?.defaultName ?? "";

  const handleRefreshAll = useCallback(() => {
    tree.refresh({ preserveExpanded: true });
  }, [tree]);

  useImperativeHandle(
    ref,
    () => ({
      refreshAll: handleRefreshAll,
    }),
    [handleRefreshAll]
  );

  if (!workspaceDir) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
        {t("rightPanel.noWorkspace")}
      </div>
    );
  }

  if (tree.error) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-destructive">
        {tree.error}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <FilesIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">
            {t("rightPanel.explorer")}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            aria-label={t("rightPanel.menuShowHiddenFiles")}
            className={cn(
              "rounded-md p-1 transition-colors hover:bg-muted/30",
              tree.showHidden
                ? "text-foreground"
                : "text-muted-foreground/60 hover:text-foreground"
            )}
            onClick={tree.toggleShowHidden}
            title={t("rightPanel.menuShowHiddenFiles")}
            type="button"
          >
            {tree.showHidden ? (
              <EyeIcon className="size-3.5" />
            ) : (
              <EyeOffIcon className="size-3.5" />
            )}
          </button>
          <button
            aria-label={t("rightPanel.menuRefresh")}
            className="rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-muted/30 hover:text-foreground"
          disabled={tree.loading}
          onClick={handleRefreshAll}
          title={t("rightPanel.menuRefresh")}
          type="button"
        >
          <RefreshCwIcon
            className={cn("size-3.5", tree.loading && "animate-spin")}
          />
        </button>
        </div>
      </div>

      <ScrollArea className={cn("min-h-0 flex-1", className)}>
        <FileTreeBlankContextMenu
          actions={actions}
          onCollapseAll={tree.collapseAll}
          onRefresh={handleRefreshAll}
          onToggleShowHidden={tree.toggleShowHidden}
          showHidden={tree.showHidden}
        >
          <div className="min-h-full p-2">
            {isInitialLoad ? (
              <div className="px-2 py-4 text-sm text-muted-foreground">
                {t("rightPanel.loading")}
              </div>
            ) : (
              <FileTree
                className="border-none bg-transparent p-0"
                expanded={tree.expanded}
                onExpandedChange={tree.handleExpandedChange}
                onSelect={(path) => {
                  tree.setSelectedPath(path);

                  const entry = findTreeEntry(path, tree.entriesByPath);
                  if (entry && !entry.isDir) {
                    onFileOpen?.({ path: entry.path, name: entry.name });
                  }
                }}
                selectedPath={tree.selectedPath}
              >
                {renderTreeEntries({
                  entries: rootEntries,
                  entriesByPath: tree.entriesByPath,
                  actions,
                  isExpanded: tree.isExpanded,
                  toggleExpanded: tree.toggleExpanded,
                  onRefresh: handleRefreshAll,
                })}
              </FileTree>
            )}
          </div>
        </FileTreeBlankContextMenu>
      </ScrollArea>

      <FileTreeNameDialog
        defaultName={nameDialogDefaultName}
        key={`${nameDialogMode ?? "closed"}-${actions.nameDialog?.targetPath ?? ""}`}
        mode={nameDialogMode}
        onOpenChange={(open) => {
          if (!open) {
            actions.closeNameDialog();
          }
        }}
        onSubmit={actions.submitNameDialog}
      />

      <FileTreeDeleteDialog
        isDir={actions.deleteTarget?.isDir ?? false}
        onConfirm={actions.confirmDelete}
        onOpenChange={(open) => {
          if (!open) {
            actions.closeDeleteDialog();
          }
        }}
        targetName={actions.deleteTarget?.name ?? null}
      />
    </div>
  );
});
