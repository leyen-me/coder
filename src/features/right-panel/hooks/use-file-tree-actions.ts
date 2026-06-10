"use client";

import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import type { ListDirEntry } from "@/features/agent/tools/types";
import { insertFileMentionIntoComposer } from "@/features/chat/lib/composer-insert-store";
import { useTranslation } from "@/lib/i18n/locale-provider";

import type { FilePreviewTab } from "../hooks/use-file-preview-tabs";
import type { UseWorkspaceFileTreeResult } from "../hooks/use-workspace-file-tree";
import type { FileTreeClipboardEntry } from "../lib/file-tree-clipboard";
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
  basenameTreePath,
  joinTreePath,
  normalizeTreePath,
  parentTreePath,
  resolvePasteDestinationPath,
  ROOT_PATH,
  withCopySuffix,
  withNumberedSuffix,
} from "../lib/workspace-path-utils";
import type { FileTreeNameDialogMode } from "../components/file-tree-dialogs";

type UseFileTreeActionsOptions = {
  workspaceDir: string | null;
  tree: UseWorkspaceFileTreeResult;
  onFileOpen?: (file: FilePreviewTab) => void;
  onFileClose?: (path: string) => void;
  onFileRename?: (oldPath: string, file: FilePreviewTab) => void;
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

function isAlreadyExistsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("already_exists") || message.includes("already exists")
  );
}

async function pasteClipboardEntry(
  workspaceDir: string,
  folderPath: string,
  clipboard: FileTreeClipboardEntry
): Promise<string | null> {
  if (clipboard.operation === "cut") {
    const destPath = resolvePasteDestinationPath(
      folderPath,
      clipboard.path,
      clipboard.name,
      "cut"
    );
    if (!destPath) {
      return null;
    }
    await moveWorkspacePath(workspaceDir, clipboard.path, destPath);
    return destPath;
  }

  const initialDest = resolvePasteDestinationPath(
    folderPath,
    clipboard.path,
    clipboard.name,
    "copy"
  );
  if (!initialDest) {
    return null;
  }

  let attemptName = basenameTreePath(initialDest);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const destPath = joinTreePath(folderPath, attemptName);
    try {
      await copyWorkspacePath(workspaceDir, clipboard.path, destPath);
      return destPath;
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }

      attemptName =
        attempt === 0
          ? withCopySuffix(clipboard.name)
          : withNumberedSuffix(clipboard.name, attempt + 1);
    }
  }

  throw new Error("Unable to find an available paste destination name");
}

export function useFileTreeActions({
  workspaceDir,
  tree,
  onFileOpen,
  onFileClose,
  onFileRename,
  openPreviewPaths,
}: UseFileTreeActionsOptions) {
  const { t } = useTranslation();
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [clipboard, setClipboard] = useState<FileTreeClipboardEntry | null>(null);

  const hasClipboard = clipboard !== null;

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
    (
      path: string,
      options?: {
        name?: string;
        isDir?: boolean;
      }
    ) => {
      insertFileMentionIntoComposer(path, options);
    },
    []
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
      setClipboard({
        operation: "copy",
        path: entry.path,
        name: entry.name,
        isDir: entry.isDir,
      });
      toast.success(t("rightPanel.toastCopiedForPaste"));
    },
    [t]
  );

  const handleCutEntry = useCallback(
    (entry: ListDirEntry) => {
      setClipboard({
        operation: "cut",
        path: entry.path,
        name: entry.name,
        isDir: entry.isDir,
      });
      toast.success(t("rightPanel.toastCutForPaste"));
    },
    [t]
  );

  const handlePasteInto = useCallback(
    async (folderPath: string) => {
      if (!workspaceDir || !clipboard) {
        return;
      }

      const source = clipboard;

      try {
        const pastedPath = await pasteClipboardEntry(
          workspaceDir,
          folderPath,
          source
        );
        if (!pastedPath) {
          return;
        }

        setClipboard(null);

        if (source.operation === "cut") {
          onFileClose?.(source.path);
        }

        tree.ensureExpanded(folderPath);
        await invalidateAfterChange([
          folderPath,
          parentTreePath(source.path),
          parentTreePath(pastedPath),
        ]);
        toast.success(t("rightPanel.toastPasted"));
      } catch (error) {
        handleError(error);
      }
    },
    [clipboard, handleError, invalidateAfterChange, onFileClose, t, tree, workspaceDir]
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
        } else if (openPreviewPaths?.has(nameDialog.targetPath)) {
          onFileRename?.(nameDialog.targetPath, { path: nextPath, name });
        }
        await invalidateAfterChange([parentPath]);
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
      onFileRename,
      onFileOpen,
      openPreviewPaths,
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
