"use client";

import { ClipboardListIcon, FileIcon, FilesIcon, GitBranchIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useRegisterHotkeyAction } from "@/features/keyboard-shortcuts/hotkey-actions-context";

import { createFileTreePointerDragProps } from "@/lib/dnd/workspace-path-pointer";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import { useFileEditorSessions } from "../hooks/use-file-editor-sessions";
import { useFilePreviewTabs } from "../hooks/use-file-preview-tabs";
import { useRightPanel } from "../right-panel-context";
import { FilePreview } from "./file-preview";
import { PlanPreviewPanel } from "./plan-preview-panel";
import { UnsavedFileCloseDialog } from "./unsaved-file-close-dialog";
import { WorkspaceFileTree } from "./workspace-file-tree";
import type { WorkspaceFileTreeHandle } from "./workspace-file-tree";

import { GitProvider } from "@/features/git/git-provider";
import { SourceControlPanel } from "@/features/git/components/source-control-panel";

type FileTreePanelProps = {
  workspaceDir: string | null;
};

export function FileTreePanel({ workspaceDir }: FileTreePanelProps) {
  const { t } = useTranslation();
  const {
    isPlanTabActive,
    activePlanName,
    openPlanPreview,
    deactivatePlanTab,
    planUpdateTick,
    isSourceControlTabActive,
    openSourceControlTab,
    deactivateSourceControlTab,
    isOpen: isRightPanelOpen,
  } = useRightPanel();
  const {
    tabs,
    activeTabPath,
    isExplorerActive,
    openFile,
    closeFile,
    renameFile,
    showExplorer,
    activateFile,
  } = useFilePreviewTabs();
  const {
    confirmDiscard,
    confirmSave,
    createRequestClose,
    dismissPendingClose,
    isSaving,
    pendingClose,
    saveFile,
    setSession,
  } = useFileEditorSessions();

  const requestCloseFile = useMemo(
    () => createRequestClose(closeFile),
    [closeFile, createRequestClose]
  );

  const openPreviewPaths = useMemo(
    () => new Set(tabs.map((tab) => tab.path)),
    [tabs]
  );
  const fileTreeRef = useRef<WorkspaceFileTreeHandle>(null);
  const [planTabPulse, setPlanTabPulse] = useState(false);
  const lastPlanUpdateTick = useRef(planUpdateTick);
  const lastWorkspaceDir = useRef(workspaceDir);

  useEffect(() => {
    if (lastWorkspaceDir.current === workspaceDir) {
      return;
    }

    lastWorkspaceDir.current = workspaceDir;
    openPlanPreview(null);
  }, [openPlanPreview, workspaceDir]);

  useEffect(() => {
    if (planUpdateTick === 0 || planUpdateTick === lastPlanUpdateTick.current) {
      return;
    }

    lastPlanUpdateTick.current = planUpdateTick;
    setPlanTabPulse(true);
    const timer = window.setTimeout(() => {
      setPlanTabPulse(false);
    }, 1500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [planUpdateTick]);

  const activeTab = tabs.find((tab) => tab.path === activeTabPath) ?? null;
  const showExplorerPanel =
    isExplorerActive && !isPlanTabActive && !isSourceControlTabActive;

  const handleShowExplorer = useCallback(() => {
    deactivatePlanTab();
    deactivateSourceControlTab();
    showExplorer();
  }, [deactivatePlanTab, deactivateSourceControlTab, showExplorer]);

  const handleOpenFile = useCallback(
    (file: { path: string; name: string }) => {
      deactivatePlanTab();
      deactivateSourceControlTab();
      openFile(file);
    },
    [deactivatePlanTab, deactivateSourceControlTab, openFile]
  );

  const handleActivateFile = useCallback(
    (path: string) => {
      deactivatePlanTab();
      deactivateSourceControlTab();
      activateFile(path);
    },
    [activateFile, deactivatePlanTab, deactivateSourceControlTab]
  );

  const handleCloseActivePreview = useCallback(() => {
    if (!activeTabPath || isExplorerActive) {
      return false;
    }

    requestCloseFile(activeTabPath, activeTab?.name);
    return true;
  }, [activeTab?.name, activeTabPath, isExplorerActive, requestCloseFile]);

  const handleSaveActivePreview = useCallback(() => {
    if (!activeTabPath || isExplorerActive) {
      return false;
    }

    void saveFile(activeTabPath);
    return true;
  }, [activeTabPath, isExplorerActive, saveFile]);

  useRegisterHotkeyAction("file.closePreview", handleCloseActivePreview);
  useRegisterHotkeyAction("file.save", handleSaveActivePreview);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b px-2 py-1.5">
        <div
          className={cn(
            "group inline-flex h-7 shrink-0 items-center rounded-md border text-xs",
            showExplorerPanel
              ? "border-border/40 bg-muted/30 text-foreground/80"
              : "border-transparent text-muted-foreground/70 hover:bg-muted/20"
          )}
        >
          <button
            aria-label={t("rightPanel.explorer")}
            className="rounded-l-md px-1.5 py-1 text-muted-foreground/60 transition-colors hover:bg-muted/30 hover:text-muted-foreground"
            onClick={handleShowExplorer}
            type="button"
          >
            <FilesIcon className="size-3" />
          </button>
          <button
            className="max-w-40 truncate px-2 py-1"
            onClick={handleShowExplorer}
            type="button"
          >
            {t("rightPanel.explorer")}
          </button>
          <button
            aria-label={t("rightPanel.menuRefresh")}
            className="rounded-r-md px-1.5 py-1 text-muted-foreground/60 transition-colors hover:bg-muted/30 hover:text-muted-foreground"
            onClick={(event) => {
              event.stopPropagation();
              fileTreeRef.current?.refreshAll();
            }}
            title={t("rightPanel.menuRefresh")}
            type="button"
          >
            <RefreshCwIcon className="size-3" />
          </button>
        </div>

        <div
          className={cn(
            "group inline-flex h-7 shrink-0 items-center rounded-md border text-xs transition-colors duration-500",
            isPlanTabActive
              ? "border-border/40 bg-muted/30 text-foreground/80"
              : "border-transparent text-muted-foreground/70 hover:bg-muted/20",
            planTabPulse && "border-primary/40 bg-primary/10 text-primary"
          )}
        >
          <button
            aria-label={t("rightPanel.plan")}
            className="rounded-l-md px-1.5 py-1 text-muted-foreground/60 transition-colors hover:bg-muted/30 hover:text-muted-foreground"
            onClick={() => openPlanPreview(activePlanName)}
            type="button"
          >
            <ClipboardListIcon className="size-3" />
          </button>
          <button
            className="max-w-40 truncate px-2 py-1"
            onClick={() => openPlanPreview(activePlanName)}
            type="button"
          >
            {t("rightPanel.plan")}
          </button>
        </div>

        {/* Source Control tab button */}
        <div
          className={cn(
            "group inline-flex h-7 shrink-0 items-center rounded-md border text-xs",
            isSourceControlTabActive
              ? "border-border/40 bg-muted/30 text-foreground/80"
              : "border-transparent text-muted-foreground/70 hover:bg-muted/20",
          )}
        >
          <button
            aria-label={t("git.sourceControl")}
            className="rounded-l-md px-1.5 py-1 text-muted-foreground/60 transition-colors hover:bg-muted/30 hover:text-muted-foreground"
            onClick={() => openSourceControlTab()}
            type="button"
          >
            <GitBranchIcon className="size-3" />
          </button>
          <button
            className="max-w-40 truncate px-2 py-1"
            onClick={() => openSourceControlTab()}
            type="button"
          >
            {t("git.sourceControl")}
          </button>
        </div>

        {tabs.map((tab) => {
          const isActive = activeTabPath === tab.path;
          const pointerDragProps = createFileTreePointerDragProps({
            isDir: false,
            name: tab.name,
            path: tab.path,
          });

          return (
            <div
              key={tab.path}
              className={cn(
                "group inline-flex h-7 shrink-0 cursor-grab items-center rounded-md border text-xs active:cursor-grabbing",
                isActive
                  ? "border-border/40 bg-muted/30 text-foreground/80"
                  : "border-transparent text-muted-foreground/70 hover:bg-muted/20"
              )}
              {...pointerDragProps}
            >
              <button
                aria-label={t("rightPanel.closePreview")}
                className="rounded-l-md px-1.5 py-1 text-muted-foreground/60 transition-colors hover:bg-muted/30 hover:text-muted-foreground"
                onClick={() => requestCloseFile(tab.path, tab.name)}
                type="button"
              >
                <FileIcon className="size-3 group-hover:hidden" />
                <XIcon className="hidden size-3 group-hover:block" />
              </button>
              <button
                className="max-w-40 truncate px-2 py-1 font-mono"
                onClick={() => handleActivateFile(tab.path)}
                title={tab.path}
                type="button"
              >
                {tab.name}
              </button>
            </div>
          );
        })}
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          className={cn(
            "absolute inset-0",
            showExplorerPanel
              ? "z-10 opacity-100"
              : "pointer-events-none z-0 opacity-0"
          )}
        >
          <WorkspaceFileTree
            ref={fileTreeRef}
            onFileClose={requestCloseFile}
            onFileOpen={handleOpenFile}
            onFileRename={renameFile}
            openPreviewPaths={openPreviewPaths}
            workspaceDir={workspaceDir}
          />
        </div>

        <div
          className={cn(
            "absolute inset-0",
            isPlanTabActive
              ? "z-10 opacity-100"
              : "pointer-events-none z-0 opacity-0"
          )}
        >
          <PlanPreviewPanel
            planName={activePlanName}
            workspaceDir={workspaceDir}
          />
        </div>

        {/* Source Control panel */}
        <div
          className={cn(
            "absolute inset-0",
            isSourceControlTabActive
              ? "z-10 opacity-100"
              : "pointer-events-none z-0 opacity-0"
          )}
        >
          <GitProvider
            isActive={isRightPanelOpen && isSourceControlTabActive}
            workspaceDir={workspaceDir}
          >
            <SourceControlPanel workspaceDir={workspaceDir} />
          </GitProvider>
        </div>

        {tabs.map((tab) => (
          <div
            key={tab.path}
            className={cn(
              "absolute inset-0",
              activeTabPath === tab.path &&
                !isPlanTabActive &&
                !isSourceControlTabActive
                ? "z-10 opacity-100"
                : "pointer-events-none z-0 opacity-0"
            )}
          >
            <FilePreview
              onSessionChange={setSession}
              path={tab.path}
              workspaceDir={workspaceDir}
            />
          </div>
        ))}
      </div>

      <UnsavedFileCloseDialog
        fileName={pendingClose?.fileName ?? null}
        isSaving={isSaving}
        onDiscard={() => {
          confirmDiscard(closeFile);
        }}
        onOpenChange={(open) => {
          if (!open) {
            dismissPendingClose();
          }
        }}
        onSave={() => {
          void confirmSave(closeFile);
        }}
        open={pendingClose !== null}
      />
    </div>
  );
}
