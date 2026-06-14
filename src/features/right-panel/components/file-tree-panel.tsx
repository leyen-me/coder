"use client";

import { ClipboardListIcon, FileIcon, FilesIcon, GitBranchIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useRegisterHotkeyAction } from "@/features/keyboard-shortcuts/hotkey-actions-context";

import { createFileTreePointerDragProps } from "@/lib/dnd/workspace-path-pointer";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useFileEditorSessions } from "../hooks/use-file-editor-sessions";
import { useFilePreviewTabs } from "../hooks/use-file-preview-tabs";
import { useRightPanel } from "../right-panel-context";
import { FilePreview } from "./file-preview";
import { PlanPreviewPanel } from "./plan-preview-panel";
import { UnsavedFileCloseDialog } from "./unsaved-file-close-dialog";
import { WorkspaceFileTree } from "./workspace-file-tree";

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
    <div className="flex h-full min-h-0 flex-col">
      <Tabs
        className="flex min-h-0 flex-1 flex-col gap-0"
        value={mainTabValue}
        onValueChange={handleMainTabChange}
      >
        {/* ── Level 1: Underline-style tabs ── */}
        <div className="shrink-0 border-b px-3 py-1.5">
          <TabsList className="h-7 w-full" variant="line">
            <TabsTrigger
              className="h-7 flex-1 gap-1.5 px-2 text-xs"
              value="explorer"
            >
              <FilesIcon className="size-3.5 shrink-0" />
              {t("rightPanel.explorer")}
            </TabsTrigger>
            <TabsTrigger
              className="h-7 flex-1 gap-1.5 px-2 text-xs"
              value="source-control"
            >
              <GitBranchIcon className="size-3.5 shrink-0" />
              {t("git.sourceControl")}
            </TabsTrigger>
            <TabsTrigger
              className={cn(
                "h-7 flex-1 gap-1.5 px-2 text-xs transition-colors duration-500",
                planTabPulse && "text-primary"
              )}
              value="plan"
            >
              <ClipboardListIcon className="size-3.5 shrink-0" />
              {t("rightPanel.plan")}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── Explorer Panel ── */}
        <TabsContent
          className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
          value="explorer"
        >
          {/* Level 2: File preview tabs (rounded rectangle) */}
          <div className="flex items-center gap-1 overflow-x-auto border-b px-2 py-1.5">
            {/* File tree tab — always visible, cannot close */}
            <button
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-1.5 py-1 text-xs transition-colors",
                activeTabPath === null
                  ? "border-border/40 bg-muted/30 text-foreground/80"
                  : "border-transparent text-muted-foreground/70 hover:bg-muted/20"
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

          {/* File tree or file preview */}
          <div className="relative min-h-0 flex-1">
            <div className={cn("absolute inset-0", activeTabPath !== null && "hidden")}>
              <WorkspaceFileTree
                onFileClose={requestCloseFile}
                onFileOpen={handleOpenFile}
                onFileRename={renameFile}
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
          className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
          value="plan"
        >
          <PlanPreviewPanel
            planName={activePlanName}
            workspaceDir={workspaceDir}
          />
        </TabsContent>

        {/* ── Source Control Panel ── */}
        <TabsContent
          className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
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
