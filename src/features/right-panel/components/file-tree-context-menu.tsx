"use client";

import type { ReactNode } from "react";
import {
  ClipboardPasteIcon,
  CopyIcon,
  ExternalLinkIcon,
  EyeIcon,
  FileIcon,
  FilePlusIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  MessageSquarePlusIcon,
  PencilIcon,
  RefreshCwIcon,
  ScissorsIcon,
  TrashIcon,
} from "lucide-react";

import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { ListDirEntry } from "@/features/agent/tools/types";
import { useTranslation } from "@/lib/i18n/locale-provider";

import type { useFileTreeActions } from "../hooks/use-file-tree-actions";
import {
  getCreateTargetPath,
  getPasteTargetPath,
} from "../hooks/use-file-tree-actions";

type FileTreeActions = ReturnType<typeof useFileTreeActions>;

type FileTreeEntryContextMenuProps = {
  entry: ListDirEntry;
  actions: FileTreeActions;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  children: ReactNode;
};

export function FileTreeEntryContextMenu({
  entry,
  actions,
  isExpanded,
  onToggleExpanded,
  children,
}: FileTreeEntryContextMenuProps) {
  const { t } = useTranslation();
  const createTarget = getCreateTargetPath(entry);
  const pasteTarget = getPasteTargetPath(entry);

  if (entry.isDir) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={onToggleExpanded}>
            {isExpanded ? (
              <FolderIcon />
            ) : (
              <FolderOpenIcon />
            )}
            {isExpanded
              ? t("rightPanel.menuCollapse")
              : t("rightPanel.menuExpand")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => {
              actions.openNameDialog("new-file", createTarget);
            }}
          >
            <FilePlusIcon />
            {t("rightPanel.menuNewFile")}
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              actions.openNameDialog("new-folder", createTarget);
            }}
          >
            <FolderPlusIcon />
            {t("rightPanel.menuNewFolder")}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!actions.hasClipboard}
            onSelect={() => {
              void actions.handlePasteInto(pasteTarget);
            }}
          >
            <ClipboardPasteIcon />
            {t("rightPanel.menuPaste")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => {
              void actions.handleCopyPath(entry.path, false);
            }}
          >
            <CopyIcon />
            {t("rightPanel.menuCopyPath")}
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              void actions.handleCopyPath(entry.path, true);
            }}
          >
            <CopyIcon />
            {t("rightPanel.menuCopyAbsolutePath")}
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              actions.handleCopyEntry(entry);
            }}
          >
            <CopyIcon />
            {t("rightPanel.menuCopy")}
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              actions.handleCutEntry(entry);
            }}
          >
            <ScissorsIcon />
            {t("rightPanel.menuCut")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => {
              actions.openNameDialog("rename", entry.path, entry.name, entry.isDir);
            }}
          >
            <PencilIcon />
            {t("rightPanel.menuRename")}
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              void actions.handleReveal(entry.path);
            }}
          >
            <ExternalLinkIcon />
            {t("rightPanel.menuRevealInExplorer")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => {
              actions.openDeleteDialog(entry);
            }}
            variant="destructive"
          >
            <TrashIcon />
            {t("rightPanel.menuDelete")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onSelect={() => {
            actions.handleOpenFile(entry);
          }}
        >
          <EyeIcon />
          {t("rightPanel.menuOpen")}
        </ContextMenuItem>
        {actions.isPreviewOpen(entry.path) ? (
          <ContextMenuItem
            onSelect={() => {
              actions.handleClosePreview(entry.path);
            }}
          >
            <FileIcon />
            {t("rightPanel.menuClosePreview")}
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            void actions.handleAddToChat(entry.path);
          }}
        >
          <MessageSquarePlusIcon />
          {t("rightPanel.menuAddToChat")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            void actions.handleCopyPath(entry.path, false);
          }}
        >
          <CopyIcon />
          {t("rightPanel.menuCopyPath")}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            void actions.handleCopyPath(entry.path, true);
          }}
        >
          <CopyIcon />
          {t("rightPanel.menuCopyAbsolutePath")}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            actions.handleCopyEntry(entry);
          }}
        >
          <CopyIcon />
          {t("rightPanel.menuCopy")}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            actions.handleCutEntry(entry);
          }}
        >
          <ScissorsIcon />
          {t("rightPanel.menuCut")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            actions.openNameDialog("rename", entry.path, entry.name, entry.isDir);
          }}
        >
          <PencilIcon />
          {t("rightPanel.menuRename")}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            void actions.handleOpenExternal(entry.path);
          }}
        >
          <ExternalLinkIcon />
          {t("rightPanel.menuOpenWithDefaultApp")}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            void actions.handleReveal(entry.path);
          }}
        >
          <FolderOpenIcon />
          {t("rightPanel.menuRevealInExplorer")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            actions.openDeleteDialog(entry);
          }}
          variant="destructive"
        >
          <TrashIcon />
          {t("rightPanel.menuDelete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

type FileTreeBlankContextMenuProps = {
  actions: FileTreeActions;
  showHidden: boolean;
  onRefresh: () => void;
  onCollapseAll: () => void;
  onToggleShowHidden: () => void;
  children: ReactNode;
};

export function FileTreeBlankContextMenu({
  actions,
  showHidden,
  onRefresh,
  onCollapseAll,
  onToggleShowHidden,
  children,
}: FileTreeBlankContextMenuProps) {
  const { t } = useTranslation();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onSelect={() => {
            actions.openNameDialog("new-file", getCreateTargetPath(null));
          }}
        >
          <FilePlusIcon />
          {t("rightPanel.menuNewFile")}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            actions.openNameDialog("new-folder", getCreateTargetPath(null));
          }}
        >
          <FolderPlusIcon />
          {t("rightPanel.menuNewFolder")}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!actions.hasClipboard}
          onSelect={() => {
            void actions.handlePasteInto(getPasteTargetPath(null));
          }}
        >
          <ClipboardPasteIcon />
          {t("rightPanel.menuPaste")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            onRefresh();
          }}
        >
          <RefreshCwIcon />
          {t("rightPanel.menuRefresh")}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            onCollapseAll();
          }}
        >
          <FolderIcon />
          {t("rightPanel.menuCollapseAll")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuCheckboxItem
          checked={showHidden}
          onCheckedChange={(checked) => {
            if (checked !== showHidden) {
              onToggleShowHidden();
            }
          }}
        >
          {t("rightPanel.menuShowHiddenFiles")}
        </ContextMenuCheckboxItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
