"use client";

import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";
import {
  BotIcon,
  CheckIcon,
  ClipboardListIcon,
  CopyIcon,
  RefreshCwIcon,
} from "lucide-react";

import { PanelHeader } from "./panel-header";
import { useCallback, useEffect, useRef, useState } from "react";

import { subscribePlanFileUpdated } from "@/features/plan/plan-events";
import {
  formatPlanTabLabel,
  getLatestWorkspacePlan,
  isPlanNotFoundError,
  parsePlanInvokeError,
  readWorkspacePlan,
} from "@/features/plan/plan-service";

import { useRightPanel } from "../right-panel-context";

type PlanPreviewPanelProps = {
  workspaceDir: string | null;
  planName: string | null;
};

const UPDATED_HINT_MS = 2000;
const FLASH_MS = 900;

export function PlanPreviewPanel({
  workspaceDir,
  planName,
}: PlanPreviewPanelProps) {
  const { t } = useTranslation();
  const { planBuildActions, planUpdateTick } = useRightPanel();
  const [content, setContent] = useState("");
  const [resolvedName, setResolvedName] = useState<string | null>(planName);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showUpdatedHint, setShowUpdatedHint] = useState(false);
  const [flashContent, setFlashContent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastHandledUpdateTick = useRef(0);

  useEffect(() => {
    setContent("");
    setResolvedName(null);
    setError(null);
    setShowUpdatedHint(false);
    setFlashContent(false);
    lastHandledUpdateTick.current = 0;
  }, [workspaceDir]);

  const loadLatestPlan = useCallback(async (dir: string) => {
    const latest = await getLatestWorkspacePlan(dir);
    if (!latest?.content?.trim()) {
      setResolvedName(latest?.name ?? null);
      setContent("");
      return;
    }

    setResolvedName(latest.name);
    setContent(latest.content);
  }, []);

  const loadPlan = useCallback(
    async (options?: { refresh?: boolean }) => {
      if (!workspaceDir) {
        setContent("");
        setResolvedName(null);
        setError(null);
        return;
      }

      if (options?.refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        if (planName) {
          try {
            const read = await readWorkspacePlan(workspaceDir, planName);
            setResolvedName(read.name);
            setContent(read.content);
            return;
          } catch (loadError) {
            if (!isPlanNotFoundError(loadError)) {
              throw loadError;
            }
          }
        }

        await loadLatestPlan(workspaceDir);
      } catch (loadError) {
        setError(parsePlanInvokeError(loadError).message);
        setContent("");
        setResolvedName(null);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [loadLatestPlan, planName, workspaceDir]
  );

  const signalPlanUpdated = useCallback(() => {
    setShowUpdatedHint(true);
    setFlashContent(true);
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });

    window.setTimeout(() => {
      setShowUpdatedHint(false);
    }, UPDATED_HINT_MS);

    window.setTimeout(() => {
      setFlashContent(false);
    }, FLASH_MS);
  }, []);

  const handleCopy = useCallback(async () => {
    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
      setIsCopied(true);
      window.setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    } catch {
      // silently fail
    }
  }, [content]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  useEffect(() => {
    if (planUpdateTick === 0 || planUpdateTick === lastHandledUpdateTick.current) {
      return;
    }

    if (!workspaceDir) {
      return;
    }

    lastHandledUpdateTick.current = planUpdateTick;

    void loadPlan({ refresh: true }).then(() => {
      signalPlanUpdated();
    });
  }, [loadPlan, planUpdateTick, signalPlanUpdated, workspaceDir]);

  useEffect(() => {
    return subscribePlanFileUpdated((detail) => {
      if (!workspaceDir) {
        return;
      }

      if (planName && detail.name !== planName) {
        return;
      }

      if (detail.action === "deleted") {
        void loadPlan({ refresh: true });
      }
    });
  }, [loadPlan, planName, workspaceDir]);

  const canBuild =
    Boolean(content.trim()) &&
    Boolean(planBuildActions?.onBuild) &&
    !planBuildActions?.isRunning;

  const showSpinner = isLoading || isRefreshing;

  if (!workspaceDir) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-sm text-muted-foreground">
        {t("rightPanel.noWorkspace")}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <PanelHeader
        icon={<ClipboardListIcon className="size-4" />}
        title={
          resolvedName
            ? formatPlanTabLabel(resolvedName)
            : t("rightPanel.planManager")
        }
        badge={
          showUpdatedHint ? (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {t("rightPanel.planSaved")}
            </span>
          ) : undefined
        }
        actions={
          <>
            {canBuild ? (
              <button
                aria-label={t("chat.buildWithAgent")}
                className="inline-flex h-7 items-center gap-1 rounded-md bg-primary/10 px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:pointer-events-none disabled:opacity-50"
                disabled={planBuildActions?.isBuildPending || showSpinner}
                onClick={() => planBuildActions?.onBuild()}
                title={t("chat.buildWithAgent")}
                type="button"
              >
                <BotIcon className="size-3.5 shrink-0" />
                <span>{t("rightPanel.planBuild")}</span>
              </button>
            ) : null}
            {content.trim() ? (
              <button
                aria-label={t("rightPanel.planCopy")}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
                onClick={handleCopy}
                title={t("rightPanel.planCopy")}
                type="button"
              >
                {isCopied ? (
                  <CheckIcon className="size-3.5 text-primary" />
                ) : (
                  <CopyIcon className="size-3.5" />
                )}
              </button>
            ) : null}
            <button
              aria-label={t("rightPanel.menuRefresh")}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
              disabled={showSpinner}
              onClick={() => {
                void loadPlan({ refresh: true });
              }}
              title={t("rightPanel.menuRefresh")}
              type="button"
            >
              <RefreshCwIcon className={cn("size-3.5", showSpinner && "animate-spin")} />
            </button>
          </>
        }
      />

      <div
        ref={contentRef}
        className={cn(
          "relative min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-3 transition-colors duration-700",
          flashContent && "bg-primary/8"
        )}
      >
        {isRefreshing && content.trim() ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 bg-primary/20">
            <div className="h-full w-full animate-pulse bg-primary/70" />
          </div>
        ) : null}
        {isLoading && !content ? (
          <div className="text-sm text-muted-foreground">
            {t("rightPanel.planLoading")}
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">{error}</div>
        ) : content.trim() ? (
          <MarkdownRenderer>{content}</MarkdownRenderer>
        ) : (
          <div className="text-sm text-muted-foreground">
            {t("rightPanel.planEmpty")}
          </div>
        )}
        <div className="h-8 shrink-0" />
      </div>
    </div>
  );
}
