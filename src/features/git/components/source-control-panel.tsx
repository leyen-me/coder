"use client";

import { GitBranchIcon, HistoryIcon, InboxIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import { useGit } from "../git-provider";
import { ChangesView } from "./changes-view";
import { HistoryView } from "./history-view";
import { RemoteActions } from "./remote-actions";
import { StashView } from "./stash-view";

type SourceControlPanelProps = {
  workspaceDir: string | null;
};

export function SourceControlPanel({ workspaceDir }: SourceControlPanelProps) {
  const { t } = useTranslation();
  const { activeTab, setActiveTab, currentBranch, refresh, isLoading, isGitRepo, initRepo } = useGit();
  const [isIniting, setIsIniting] = useState(false);

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
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <GitBranchIcon className="size-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">{t("git.noRepository")}</p>
        <Button
          disabled={isIniting}
          onClick={handleInit}
          size="sm"
          type="button"
          className="gap-2"
        >
          <PlusIcon className="size-4" />
          {isIniting ? t("git.operationInProgress") : t("git.initRepository")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <GitBranchIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">
          {currentBranch ?? "—"}
        </span>
        <button
          aria-label={t("git.refresh")}
          className="ml-auto rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-muted/30 hover:text-foreground"
          disabled={isLoading}
          onClick={() => void refresh()}
          title={t("git.refresh")}
          type="button"
        >
          <RefreshCwIcon className={cn("size-3.5", isLoading && "animate-spin")} />
        </button>
        <RemoteActions />
      </div>

      {/* Tabs */}
      <Tabs
        className="flex min-h-0 flex-1 flex-col gap-0"
        onValueChange={(value) => {
          if (value === "changes" || value === "history" || value === "stash") {
            setActiveTab(value);
          }
        }}
        value={activeTab}
      >
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
          <TabsList className="h-7" variant="line">
            <TabsTrigger className="h-7 gap-1.5 px-2.5 text-xs" value="changes">
              <InboxIcon className="size-3.5 shrink-0" />
              {t("git.changes")}
            </TabsTrigger>
            <TabsTrigger className="h-7 gap-1.5 px-2.5 text-xs" value="history">
              <HistoryIcon className="size-3.5 shrink-0" />
              {t("git.history")}
            </TabsTrigger>
            <TabsTrigger className="h-7 gap-1.5 px-2.5 text-xs" value="stash">
              <InboxIcon className="size-3.5 shrink-0" />
              {t("git.stash")}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
          value="changes"
        >
          <ChangesView />
        </TabsContent>

        <TabsContent
          className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
          value="history"
        >
          <HistoryView workspaceDir={workspaceDir} />
        </TabsContent>

        <TabsContent
          className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
          value="stash"
        >
          <StashView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
