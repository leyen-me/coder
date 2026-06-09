"use client";

import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
} from "@/components/ai-elements/file-tree";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ListDirEntry } from "@/features/agent/tools/types";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

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
  openPreviewPaths?: Set<string>;
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
};

function renderTreeEntries({
  entries,
  entriesByPath,
  actions,
  isExpanded,
  toggleExpanded,
}: RenderTreeEntriesOptions) {
  return entries.map((entry) => {
    if (entry.isDir) {
      const children = entriesByPath.get(entry.path) ?? [];

      return (
        <FileTreeEntryContextMenu
          key={entry.path}
          actions={actions}
          entry={entry}
          isExpanded={isExpanded(entry.path)}
          onToggleExpanded={() => toggleExpanded(entry.path)}
        >
          <FileTreeFolder name={entry.name} path={entry.path}>
            {children.length > 0
              ? renderTreeEntries({
                  entries: children,
                  entriesByPath,
                  actions,
                  isExpanded,
                  toggleExpanded,
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
        <FileTreeFile name={entry.name} path={entry.path} />
      </FileTreeEntryContextMenu>
    );
  });
}

export function WorkspaceFileTree({
  workspaceDir,
  className,
  onFileOpen,
  onFileClose,
  openPreviewPaths,
}: WorkspaceFileTreeProps) {
  const { t } = useTranslation();
  const tree = useWorkspaceFileTree(workspaceDir);
  const actions = useFileTreeActions({
    workspaceDir,
    tree,
    onFileOpen,
    onFileClose,
    openPreviewPaths,
  });

  const rootEntries = tree.rootPath
    ? (tree.entriesByPath.get(tree.rootPath) ?? [])
    : [];
  const isInitialLoad =
    tree.loading && !tree.entriesByPath.has(ROOT_PATH);

  const nameDialogMode = actions.nameDialog?.mode ?? null;
  const nameDialogDefaultName = actions.nameDialog?.defaultName ?? "";

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
    <>
      <ScrollArea className={cn("h-full min-h-0", className)}>
        <FileTreeBlankContextMenu
          actions={actions}
          onCollapseAll={tree.collapseAll}
          onRefresh={tree.refresh}
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
    </>
  );
}
