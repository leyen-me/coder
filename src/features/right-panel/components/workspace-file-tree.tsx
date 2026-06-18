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
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";

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
import { useGitignore } from "../hooks/use-gitignore";
import { useWorkspaceFileTree } from "../hooks/use-workspace-file-tree";
import { ROOT_PATH } from "../lib/workspace-path-utils";

type WorkspaceFileTreeProps = {
  workspaceDir: string | null;
  className?: string;
  onFileOpen?: (file: FilePreviewTab) => void;
  onFileClose?: (path: string) => void;
  onFileRename?: (oldPath: string, file: FilePreviewTab) => void;
  openPreviewPaths?: Set<string>;
  /** Called when the tree loading state changes. */
  onLoadingChange?: (loading: boolean) => void;
  /** Called when the show-hidden state changes. */
  onShowHiddenChange?: (showHidden: boolean) => void;
};

export type WorkspaceFileTreeHandle = {
  refreshAll: () => void;
  toggleShowHidden: () => void;
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
  isFileIgnored: (relativePath: string, isDir: boolean) => boolean;
};

function renderTreeEntries({
  entries,
  entriesByPath,
  actions,
  isExpanded,
  toggleExpanded,
  onRefresh,
  isFileIgnored,
}: RenderTreeEntriesOptions) {
  return entries.map((entry) => {
    const pointerDragProps = createFileTreePointerDragProps({
      isDir: entry.isDir,
      name: entry.name,
      path: entry.path,
    });

    const isIgnored = isFileIgnored(entry.path, entry.isDir);

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
          <FileTreeFolder
            dimmed={isIgnored}
            name={entry.name}
            path={entry.path}
            {...pointerDragProps}
          >
            {children.length > 0
              ? renderTreeEntries({
                  entries: children,
                  entriesByPath,
                  actions,
                  isExpanded,
                  toggleExpanded,
                  onRefresh,
                  isFileIgnored,
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
          dimmed={isIgnored}
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
    onLoadingChange,
    onShowHiddenChange,
  },
  ref
) {
  const { t } = useTranslation();
  const tree = useWorkspaceFileTree(workspaceDir);
  const [gitignoreRefreshTick, setGitignoreRefreshTick] = useState(0);
  const { isIgnored } = useGitignore(workspaceDir, gitignoreRefreshTick);

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
    setGitignoreRefreshTick((c) => c + 1);
  }, [tree]);

  // Sync loading state to parent
  useEffect(() => {
    onLoadingChange?.(tree.loading);
  }, [tree.loading, onLoadingChange]);

  // Sync show-hidden state to parent
  useEffect(() => {
    onShowHiddenChange?.(tree.showHidden);
  }, [tree.showHidden, onShowHiddenChange]);

  useImperativeHandle(
    ref,
    () => ({
      refreshAll: handleRefreshAll,
      toggleShowHidden: tree.toggleShowHidden,
    }),
    [handleRefreshAll, tree.toggleShowHidden]
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
                  isFileIgnored: isIgnored,
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
