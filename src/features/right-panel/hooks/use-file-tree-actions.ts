"use client";

import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import type { ListDirEntry } from "@/features/agent/tools/types";
import { useTranslation } from "@/lib/i18n/locale-provider";

import type { FilePreviewTab } from "../hooks/use-file-preview-tabs";
import type { UseWorkspaceFileTreeResult } from "../hooks/use-workspace-file-tree";
import {
  clearFileTreeClipboard,
  getFileTreeClipboard,
  setFileTreeClipboard,
} from "../lib/file-tree-clipboard";
import {
  copyWorkspacePath,
  createWorkspaceDir,
  createWorkspaceFile,
  deleteWorkspacePath,
  moveWorkspacePath,
  renameWorkspacePath,
  resolveWorkspaceAbsolutePath,
} from "../lib/workspace-file-ops";
import {
  joinTreePath,
  normalizeTreePath,
  parentTreePath,
  ROOT_PATH,
} from "../lib/workspace-path-utils";
import type { FileTreeNameDialogMode } from "../components/file-tree-dialogs";

type UseFileTreeActionsOptions = {
  workspaceDir: string | null;
  tree: UseWorkspaceFileTreeResult;
  onFileOpen?: (file: FilePreviewTab) => void;
  onFileClose?: (path: string) => void;
  openPreviewPaths?: Set<string>;
};

type DeleteTarget = {
  path: string;
  name: string;
  isDir: boolean;
};

type NameDialogState = {
  mode: FileTreeNameDialogMode;
  targetPath: string;
  defaultName: string;
  isDir?: boolean;
};

async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard is unavailable");
  }
  await navigator.clipboard.writeText(text);
}

async function revealInExplorer(
  workspaceDir: string,
  path: string
): Promise<void> {
  const absolutePath = await resolveWorkspaceAbsolutePath(workspaceDir, path);
  await revealItemInDir(absolutePath);
}

async function openWithDefaultApp(
  workspaceDir: string,
  path: string
): Promise<void> {
  const absolutePath = await resolveWorkspaceAbsolutePath(workspaceDir, path);
  await openPath(absolutePath);
}

export function useFileTreeActions({
  workspaceDir,
  tree,
  onFileOpen,
  onFileClose,
  openPreviewPaths,
}: UseFileTreeActionsOptions) {
  const { t } = useTranslation();
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [hasClipboard, setHasClipboard] = useState(false);

  const syncClipboard = useCallback(() => {
    setHasClipboard(getFileTreeClipboard() !== null);
  }, []);

  const invalidateAfterChange = useCallback(
    async (paths: string[]) => {
      const uniquePaths = [
        ...new Set(paths.map(normalizeTreePath)),
      ];
      await tree.reloadPaths(uniquePaths);
    },
    [tree]
  );

  const handleError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    toast.error(message);
  }, []);

  const handleCopyPath = useCallback(
    async (path: string, absolute: boolean) => {
      if (!workspaceDir) {
        return;
      }

      try {
        const text = absolute
          ? await resolveWorkspaceAbsolutePath(workspaceDir, path)
          : path;
        await copyText(text);
        toast.success(t("rightPanel.toastCopied"));
      } catch (error) {
        handleError(error);
      }
    },
    [handleError, t, workspaceDir]
  );

  const handleAddToChat = useCallback(
    async (path: string) => {
      try {
        await copyText(`@${path}`);
        toast.success(t("rightPanel.toastAddedToChat"));
      } catch (error) {
        handleError(error);
      }
    },
    [handleError, t]
  );

  const handleReveal = useCallback(
    async (path: string) => {
      if (!workspaceDir) {
        return;
      }

      try {
        await revealInExplorer(workspaceDir, path);
      } catch (error) {
        handleError(error);
      }
    },
    [handleError, workspaceDir]
  );

  const handleOpenExternal = useCallback(
    async (path: string) => {
      if (!workspaceDir) {
        return;
      }

      try {
        await openWithDefaultApp(workspaceDir, path);
      } catch (error) {
        handleError(error);
      }
    },
    [handleError, workspaceDir]
  );

  const handleOpenFile = useCallback(
    (entry: ListDirEntry) => {
      onFileOpen?.({ path: entry.path, name: entry.name });
    },
    [onFileOpen]
  );

  const handleClosePreview = useCallback(
    (path: string) => {
      onFileClose?.(path);
    },
    [onFileClose]
  );

  const handleCopyEntry = useCallback(
    (entry: ListDirEntry) => {
      setFileTreeClipboard({
        operation: "copy",
        path: entry.path,
        name: entry.name,
        isDir: entry.isDir,
      });
      syncClipboard();
      toast.success(t("rightPanel.toastCopiedForPaste"));
    },
    [syncClipboard, t]
  );

  const handleCutEntry = useCallback(
    (entry: ListDirEntry) => {
      setFileTreeClipboard({
        operation: "cut",
        path: entry.path,
        name: entry.name,
        isDir: entry.isDir,
      });
      syncClipboard();
      toast.success(t("rightPanel.toastCutForPaste"));
    },
    [syncClipboard, t]
  );

  const handlePasteInto = useCallback(
    async (folderPath: string) => {
      if (!workspaceDir) {
        return;
      }

      const clipboard = getFileTreeClipboard();
      if (!clipboard) {
        return;
      }

      const destPath = joinTreePath(folderPath, clipboard.name);
      if (destPath === clipboard.path) {
        return;
      }

      try {
        if (clipboard.operation === "copy") {
          await copyWorkspacePath(workspaceDir, clipboard.path, destPath);
        } else {
          await moveWorkspacePath(workspaceDir, clipboard.path, destPath);
          clearFileTreeClipboard();
          syncClipboard();
          onFileClose?.(clipboard.path);
        }

        await invalidateAfterChange([
          folderPath,
          parentTreePath(clipboard.path),
        ]);
        toast.success(t("rightPanel.toastPasted"));
      } catch (error) {
        handleError(error);
      }
    },
    [handleError, invalidateAfterChange, onFileClose, syncClipboard, t, workspaceDir]
  );

  const openNameDialog = useCallback(
    (
      mode: FileTreeNameDialogMode,
      targetPath: string,
      defaultName = "",
      isDir?: boolean
    ) => {
      setNameDialog({ mode, targetPath, defaultName, isDir });
    },
    []
  );

  const closeNameDialog = useCallback(() => {
    setNameDialog(null);
  }, []);

  const submitNameDialog = useCallback(
    async (name: string) => {
      if (!workspaceDir || !nameDialog) {
        return;
      }

      const parentPath =
        nameDialog.mode === "rename"
          ? parentTreePath(nameDialog.targetPath)
          : nameDialog.targetPath;
      const nextPath = joinTreePath(parentPath, name);

      if (nameDialog.mode === "rename") {
        await renameWorkspacePath(
          workspaceDir,
          nameDialog.targetPath,
          name
        );
        if (nameDialog.isDir) {
          tree.renameExpandedPath(nameDialog.targetPath, nextPath);
        }
        onFileClose?.(nameDialog.targetPath);
        await invalidateAfterChange([parentPath]);
        if (!nameDialog.isDir) {
          onFileOpen?.({ path: nextPath, name });
        }
        toast.success(t("rightPanel.toastRenamed"));
        return;
      }

      if (nameDialog.mode === "new-folder") {
        await createWorkspaceDir(workspaceDir, nextPath);
        tree.ensureExpanded(parentPath);
        await invalidateAfterChange([parentPath]);
        tree.ensureExpanded(nextPath);
        toast.success(t("rightPanel.toastFolderCreated"));
        return;
      }

      await createWorkspaceFile(workspaceDir, nextPath);
      tree.ensureExpanded(parentPath);
      await invalidateAfterChange([parentPath]);
      onFileOpen?.({ path: nextPath, name });
      toast.success(t("rightPanel.toastFileCreated"));
    },
    [
      invalidateAfterChange,
      nameDialog,
      onFileClose,
      onFileOpen,
      t,
      tree,
      workspaceDir,
    ]
  );

  const openDeleteDialog = useCallback((entry: ListDirEntry) => {
    setDeleteTarget({
      path: entry.path,
      name: entry.name,
      isDir: entry.isDir,
    });
  }, []);

  const closeDeleteDialog = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!workspaceDir || !deleteTarget) {
      return;
    }

    try {
      await deleteWorkspacePath(
        workspaceDir,
        deleteTarget.path,
        deleteTarget.isDir
      );
      if (deleteTarget.isDir) {
        tree.removeExpandedPath(deleteTarget.path);
      }
      onFileClose?.(deleteTarget.path);
      await invalidateAfterChange([parentTreePath(deleteTarget.path)]);
      toast.success(t("rightPanel.toastDeleted"));
    } catch (error) {
      handleError(error);
      throw error;
    }
  }, [
    deleteTarget,
    handleError,
    invalidateAfterChange,
    onFileClose,
    t,
    workspaceDir,
  ]);

  const isPreviewOpen = useCallback(
    (path: string) => openPreviewPaths?.has(path) ?? false,
    [openPreviewPaths]
  );

  return {
    nameDialog,
    deleteTarget,
    hasClipboard,
    isPreviewOpen,
    handleCopyPath,
    handleAddToChat,
    handleReveal,
    handleOpenExternal,
    handleOpenFile,
    handleClosePreview,
    handleCopyEntry,
    handleCutEntry,
    handlePasteInto,
    openNameDialog,
    closeNameDialog,
    submitNameDialog,
    openDeleteDialog,
    closeDeleteDialog,
    confirmDelete,
  };
}

export function getPasteTargetPath(entry: ListDirEntry | null): string {
  if (!entry) {
    return ROOT_PATH;
  }
  return entry.isDir ? entry.path : parentTreePath(entry.path);
}

export function getCreateTargetPath(entry: ListDirEntry | null): string {
  if (!entry) {
    return ROOT_PATH;
  }
  return entry.isDir ? entry.path : parentTreePath(entry.path);
}
