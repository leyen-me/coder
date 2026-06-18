"use client";

import {
  ClipboardListIcon,
  EyeIcon,
  EyeOffIcon,
  FileIcon,
  FilesIcon,
  GitBranchIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useRegisterHotkeyAction } from "@/features/keyboard-shortcuts/hotkey-actions-context";

import { createFileTreePointerDragProps } from "@/lib/dnd/workspace-path-pointer";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import { Tabs, TabsContent } from "@/components/ui/tabs";

import { useFileEditorSessions } from "../hooks/use-file-editor-sessions";
import { useFilePreviewTabs } from "../hooks/use-file-preview-tabs";
import { OPEN_FILE_IN_PREVIEW_EVENT } from "../lib/open-file-event";
import { useRightPanel } from "../right-panel-context";
import { FilePreview } from "./file-preview";
import { PanelHeader } from "./panel-header";
import { PlanPreviewPanel } from "./plan-preview-panel";
import { UnsavedFileCloseDialog } from "./unsaved-file-close-dialog";
import { WorkspaceFileTree, type WorkspaceFileTreeHandle } from "./workspace-file-tree";

import { GitProvider } from "@/features/git/git-provider";
import { SourceControlPanel } from "@/features/git/components/source-control-panel";

type FileTreePanelProps = {
  workspaceDir: string | null;
};

/** A single icon button in the vertical navigation sidebar. */
function NavButton({
  icon,
  isActive,
  onClick,
  tooltip,
  className,
}: {
  icon: ReactNode;
  isActive: boolean;
  onClick: () => void;
  tooltip: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            "relative flex size-10 items-center justify-center rounded-lg transition-colors",
            isActive
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            className
          )}
          onClick={onClick}
          type="button"
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

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
    setOpen: setIsRightPanelOpen,
  } = useRightPanel();
  const {
    tabs,
    activeTabPath,
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
  const [planTabPulse, setPlanTabPulse] = useState(false);
  const lastPlanUpdateTick = useRef(planUpdateTick);
  const [showHidden, setShowHidden] = useState(false);
  const [fileTreeLoading, setFileTreeLoading] = useState(false);
  const fileTreeRef = useRef<WorkspaceFileTreeHandle>(null);

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

  // Listen for open-file events dispatched from outside the file tree
  // (e.g., from file-diff tool output cards in chat messages).
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ path: string; name: string }>).detail;
      handleOpenFile(detail);
      setIsRightPanelOpen(true);
    };

    window.addEventListener(OPEN_FILE_IN_PREVIEW_EVENT, handler);
    return () => window.removeEventListener(OPEN_FILE_IN_PREVIEW_EVENT, handler);
  }, [handleOpenFile, setIsRightPanelOpen]);

  const handleActivateFile = useCallback(
    (path: string) => {
      deactivatePlanTab();
      deactivateSourceControlTab();
      activateFile(path);
    },
    [activateFile, deactivatePlanTab, deactivateSourceControlTab]
  );

  const handleCloseActivePreview = useCallback(() => {
    if (!activeTabPath) {
      return false;
    }

    requestCloseFile(activeTabPath, activeTab?.name);
    return true;
  }, [activeTab?.name, activeTabPath, requestCloseFile]);

  const handleSaveActivePreview = useCallback(() => {
    if (!activeTabPath) {
      return false;
    }

    void saveFile(activeTabPath);
    return true;
  }, [activeTabPath, saveFile]);

  useRegisterHotkeyAction("file.closePreview", handleCloseActivePreview);
  useRegisterHotkeyAction("file.save", handleSaveActivePreview);

  /** Derive the active main tab value from context state. */
  const mainTabValue: string = isPlanTabActive
    ? "plan"
    : isSourceControlTabActive
      ? "source-control"
      : "explorer";

  const handleMainTabChange = useCallback(
    (value: string) => {
      if (value === "explorer") {
        handleShowExplorer();
      } else if (value === "plan") {
        openPlanPreview(activePlanName);
      } else if (value === "source-control") {
        openSourceControlTab();
      }
    },
    [activePlanName, handleShowExplorer, openPlanPreview, openSourceControlTab]
  );

  return (
    <div className="flex h-full min-h-0 flex-row">
      {/* ── Level 1: Vertical icon navigation bar ── */}
      <div className="flex w-[48px] shrink-0 flex-col items-center border-r bg-muted/20 py-3">
        <TooltipProvider delayDuration={300}>
          <div className="flex flex-col items-center gap-1">
            <NavButton
              icon={<FilesIcon className="size-5" />}
              isActive={mainTabValue === "explorer"}
              onClick={() => handleMainTabChange("explorer")}
              tooltip={t("rightPanel.explorer")}
            />
            <NavButton
              icon={<GitBranchIcon className="size-5" />}
              isActive={mainTabValue === "source-control"}
              onClick={() => handleMainTabChange("source-control")}
              tooltip={t("git.sourceControl")}
            />
            <NavButton
              className={planTabPulse ? "animate-pulse text-primary" : undefined}
              icon={<ClipboardListIcon className="size-5" />}
              isActive={mainTabValue === "plan"}
              onClick={() => handleMainTabChange("plan")}
              tooltip={t("rightPanel.plan")}
            />
          </div>
        </TooltipProvider>
      </div>

      {/* ── Content area ── */}
      <Tabs
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-0"
        value={mainTabValue}
        onValueChange={handleMainTabChange}
      >
        {/* ── Explorer Panel ── */}
        <TabsContent
          className="mt-0 flex min-h-0 min-w-0 flex-1 flex-col data-[state=inactive]:hidden"
          value="explorer"
        >
          <PanelHeader
            icon={<FilesIcon className="size-4" />}
            title={t("rightPanel.explorer")}
            actions={
              activeTabPath === null ? (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      aria-label={t("rightPanel.menuShowHiddenFiles")}
                      className={cn(
                        "rounded-md p-1 transition-colors hover:bg-muted/30",
                        showHidden
                          ? "text-foreground"
                          : "text-muted-foreground/60 hover:text-foreground"
                      )}
                      onClick={() => fileTreeRef.current?.toggleShowHidden()}
                      title={t("rightPanel.menuShowHiddenFiles")}
                      type="button"
                    >
                      {showHidden ? (
                        <EyeIcon className="size-3.5" />
                      ) : (
                        <EyeOffIcon className="size-3.5" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t("rightPanel.menuShowHiddenFiles")}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      aria-label={t("rightPanel.menuRefresh")}
                      className="rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-muted/30 hover:text-foreground"
                      disabled={fileTreeLoading}
                      onClick={() => fileTreeRef.current?.refreshAll()}
                      title={t("rightPanel.menuRefresh")}
                      type="button"
                    >
                      <RefreshCwIcon
                        className={cn(
                          "size-3.5",
                          fileTreeLoading && "animate-spin"
                        )}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t("rightPanel.menuRefresh")}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              ) : null
            }
          />

          {/* Level 2: File preview tabs (pill-style container) */}
          <div className="flex items-center gap-1 overflow-x-auto border-b px-2 py-2">
            <div className="flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5">
              {/* File tree tab — always visible, cannot close */}
              <button
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors",
                  activeTabPath === null
                    ? "bg-background text-foreground/80 shadow-sm"
                    : "text-muted-foreground/70 hover:bg-muted/30 hover:text-foreground"
                )}
                onClick={showExplorer}
                type="button"
              >
                <FilesIcon className="size-3" />
                <span className="truncate">{t("rightPanel.fileTree")}</span>
              </button>

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
                      "group inline-flex h-7 shrink-0 cursor-grab items-center rounded-md text-xs active:cursor-grabbing",
                      isActive
                        ? "bg-background text-foreground/80 shadow-sm"
                        : "text-muted-foreground/70 hover:bg-muted/30 hover:text-foreground"
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
          </div>

          {/* File tree or file preview */}
          <div className="relative min-h-0 min-w-0 flex-1">
            <div className={cn("absolute inset-0", activeTabPath !== null && "hidden")}>
              <WorkspaceFileTree
                ref={fileTreeRef}
                onFileClose={requestCloseFile}
                onFileOpen={handleOpenFile}
                onFileRename={renameFile}
                onLoadingChange={setFileTreeLoading}
                onShowHiddenChange={setShowHidden}
                openPreviewPaths={openPreviewPaths}
                workspaceDir={workspaceDir}
              />
            </div>
            {activeTabPath !== null ? (
              <FilePreview
                onSessionChange={setSession}
                path={activeTabPath}
                workspaceDir={workspaceDir}
              />
            ) : null}
          </div>
        </TabsContent>

        {/* ── Plan Panel ── */}
        <TabsContent
          className="mt-0 flex min-h-0 min-w-0 flex-1 flex-col data-[state=inactive]:hidden"
          value="plan"
        >
          <PlanPreviewPanel
            planName={activePlanName}
            workspaceDir={workspaceDir}
          />
        </TabsContent>

        {/* ── Source Control Panel ── */}
        <TabsContent
          className="mt-0 flex min-h-0 min-w-0 flex-1 flex-col data-[state=inactive]:hidden"
          value="source-control"
        >
          <GitProvider
            isActive={isRightPanelOpen && isSourceControlTabActive}
            workspaceDir={workspaceDir}
          >
            <SourceControlPanel workspaceDir={workspaceDir} />
          </GitProvider>
        </TabsContent>
      </Tabs>

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
