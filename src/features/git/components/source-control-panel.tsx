"use client";

import {
  AlertCircleIcon,
  GitBranchIcon,
  HistoryIcon,
  InboxIcon,
  PlusIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useCallback, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PanelHeader } from "@/features/right-panel/components/panel-header";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import { useGit } from "../git-provider";
import { BranchSelector } from "./branch-selector";
import { ChangesView } from "./changes-view";
import { HistoryView } from "./history-view";
import { RemoteActions } from "./remote-actions";

type SourceControlPanelProps = {
  workspaceDir: string | null;
};

export function SourceControlPanel({ workspaceDir }: SourceControlPanelProps) {
  const { t } = useTranslation();
  const {
    activeTab,
    setActiveTab,
    currentBranch,
    refresh,
    isLoading,
    isGitRepo,
    initRepo,
    statusEntries,
    remoteUrl,
    error,
  } = useGit();
  const [isIniting, setIsIniting] = useState(false);

  const summaryText =
    statusEntries.length === 0 ? t("git.workingTreeClean") : t("git.uncommittedChanges");

  const handleInit = useCallback(async () => {
    setIsIniting(true);
    try {
      await initRepo();
    } catch {
      // Error handled in provider
    } finally {
      setIsIniting(false);
    }
  }, [initRepo]);

  if (!workspaceDir) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-sm text-muted-foreground">
        {t("git.noRepository")}
      </div>
    );
  }

  if (!isGitRepo) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/10 p-4">
        <div className="flex max-w-sm flex-col items-center gap-4 rounded-3xl border bg-background px-6 py-8 text-center shadow-sm">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary">
            <GitBranchIcon className="size-6" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("git.sourceControl")}</p>
            <p className="text-sm text-muted-foreground">{t("git.noRepository")}</p>
          </div>
          <Button
            className="gap-2"
            disabled={isIniting}
            onClick={handleInit}
            size="sm"
            type="button"
          >
            <PlusIcon className="size-4" />
            {isIniting ? t("git.operationInProgress") : t("git.initRepository")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {/* Unified header */}
      <PanelHeader
        icon={<GitBranchIcon className="size-4" />}
        title={t("git.sourceControl")}
        actions={
          <>
            <BranchSelector />
            <RemoteActions />
            <Button
              aria-label={t("git.refresh")}
              disabled={isLoading}
              onClick={() => void refresh()}
              size="icon-xs"
              title={t("git.refresh")}
              type="button"
              variant="ghost"
            >
              <RefreshCwIcon className={cn("size-3.5", isLoading && "animate-spin")} />
            </Button>
          </>
        }
      />

      {/* Branch info bar */}
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <span className="truncate text-xs font-medium text-foreground/80">
          {currentBranch ?? "—"}
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
            remoteUrl
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground",
          )}
          title={remoteUrl ? t("git.remoteConnected") : t("git.localOnly")}
        >
          {remoteUrl ? "R" : "L"}
        </span>
        <span className="ml-auto truncate text-[11px] text-muted-foreground">
          {summaryText}
        </span>
      </div>

      {error ? (
        <Alert className="mx-3 mt-3" variant="destructive">
          <AlertCircleIcon className="size-4" />
          <AlertTitle>{t("git.error")}</AlertTitle>
          <AlertDescription className="wrap-break-word">{error}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-0"
        onValueChange={(value) => {
          if (value === "changes" || value === "history") {
            setActiveTab(value);
          }
        }}
        value={activeTab}
      >
        <div className="shrink-0 border-b px-3 py-2">
          <TabsList className="h-8 w-full rounded-lg bg-muted/70 p-0.5">
            <TabsTrigger className="h-7 flex-1 gap-1.5 rounded-md px-2 text-xs" value="changes">
              <InboxIcon className="size-3.5 shrink-0" />
              {t("git.changes")}
            </TabsTrigger>
            <TabsTrigger className="h-7 flex-1 gap-1.5 rounded-md px-2 text-xs" value="history">
              <HistoryIcon className="size-3.5 shrink-0" />
              {t("git.history")}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          className="mt-0 flex min-h-0 min-w-0 flex-1 flex-col data-[state=inactive]:hidden"
          value="changes"
        >
          <ChangesView />
        </TabsContent>

        <TabsContent
          className="mt-0 flex min-h-0 min-w-0 flex-1 flex-col data-[state=inactive]:hidden"
          value="history"
        >
          <HistoryView workspaceDir={workspaceDir} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
