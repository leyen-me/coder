"use client";

import { FileIcon, FilesIcon, XIcon } from "lucide-react";
import { useMemo } from "react";

import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import { useFilePreviewTabs } from "../hooks/use-file-preview-tabs";
import { FilePreview } from "./file-preview";
import { WorkspaceFileTree } from "./workspace-file-tree";

type FileTreePanelProps = {
  workspaceDir: string | null;
};

export function FileTreePanel({ workspaceDir }: FileTreePanelProps) {
  const { t } = useTranslation();
  const {
    tabs,
    activeTabPath,
    isExplorerActive,
    openFile,
    closeFile,
    showExplorer,
    activateFile,
  } = useFilePreviewTabs();

  const openPreviewPaths = useMemo(
    () => new Set(tabs.map((tab) => tab.path)),
    [tabs]
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b px-2 py-1.5">
        <div
          className={cn(
            "group inline-flex h-7 shrink-0 items-center rounded-md border text-xs",
            isExplorerActive
              ? "border-border/40 bg-muted/30 text-foreground/80"
              : "border-transparent text-muted-foreground/70 hover:bg-muted/20"
          )}
        >
          <button
            aria-label={t("rightPanel.explorer")}
            className="rounded-l-md px-1.5 py-1 text-muted-foreground/60 transition-colors hover:bg-muted/30 hover:text-muted-foreground"
            onClick={showExplorer}
            type="button"
          >
            <FilesIcon className="size-3" />
          </button>
          <button
            className="max-w-40 truncate px-2 py-1"
            onClick={showExplorer}
            type="button"
          >
            {t("rightPanel.explorer")}
          </button>
        </div>

        {tabs.map((tab) => {
          const isActive = activeTabPath === tab.path;

          return (
            <div
              key={tab.path}
              className={cn(
                "group inline-flex h-7 shrink-0 items-center rounded-md border text-xs",
                isActive
                  ? "border-border/40 bg-muted/30 text-foreground/80"
                  : "border-transparent text-muted-foreground/70 hover:bg-muted/20"
              )}
            >
              <button
                aria-label={t("rightPanel.closePreview")}
                className="rounded-l-md px-1.5 py-1 text-muted-foreground/60 transition-colors hover:bg-muted/30 hover:text-muted-foreground"
                onClick={() => closeFile(tab.path)}
                type="button"
              >
                <FileIcon className="size-3 group-hover:hidden" />
                <XIcon className="hidden size-3 group-hover:block" />
              </button>
              <button
                className="max-w-40 truncate px-2 py-1 font-mono"
                onClick={() => activateFile(tab.path)}
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
            isExplorerActive
              ? "z-10 opacity-100"
              : "pointer-events-none z-0 opacity-0"
          )}
        >
          <WorkspaceFileTree
            onFileClose={closeFile}
            onFileOpen={openFile}
            openPreviewPaths={openPreviewPaths}
            workspaceDir={workspaceDir}
          />
        </div>

        {tabs.map((tab) => (
          <div
            key={tab.path}
            className={cn(
              "absolute inset-0",
              activeTabPath === tab.path
                ? "z-10 opacity-100"
                : "pointer-events-none z-0 opacity-0"
            )}
          >
            <FilePreview path={tab.path} workspaceDir={workspaceDir} />
          </div>
        ))}
      </div>
    </div>
  );
}
