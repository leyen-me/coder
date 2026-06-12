"use client";

import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";
import { ClipboardListIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { subscribePlanFileUpdated } from "@/features/plan/plan-events";
import {
  formatPlanTabLabel,
  getLatestWorkspacePlan,
  readWorkspacePlan,
} from "@/features/plan/plan-service";

type PlanPreviewPanelProps = {
  workspaceDir: string | null;
  planName: string | null;
};

export function PlanPreviewPanel({
  workspaceDir,
  planName,
}: PlanPreviewPanelProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState("");
  const [resolvedName, setResolvedName] = useState<string | null>(planName);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPlan = useCallback(async () => {
    if (!workspaceDir) {
      setContent("");
      setResolvedName(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (planName) {
        const read = await readWorkspacePlan(workspaceDir, planName);
        setResolvedName(read.name);
        setContent(read.content);
        return;
      }

      const latest = await getLatestWorkspacePlan(workspaceDir);
      if (!latest?.content) {
        setResolvedName(latest?.name ?? null);
        setContent("");
        return;
      }

      setResolvedName(latest.name);
      setContent(latest.content);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : String(loadError);
      setError(message);
      setContent("");
    } finally {
      setIsLoading(false);
    }
  }, [planName, workspaceDir]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  useEffect(() => {
    return subscribePlanFileUpdated((detail) => {
      if (!workspaceDir) {
        return;
      }

      if (planName && detail.name !== planName) {
        return;
      }

      void loadPlan();
    });
  }, [loadPlan, planName, workspaceDir]);

  if (!workspaceDir) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-sm text-muted-foreground">
        {t("rightPanel.noWorkspace")}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <ClipboardListIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">
            {resolvedName
              ? formatPlanTabLabel(resolvedName)
              : t("rightPanel.plan")}
          </span>
        </div>
        <button
          aria-label={t("rightPanel.menuRefresh")}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
          onClick={() => {
            void loadPlan();
          }}
          title={t("rightPanel.menuRefresh")}
          type="button"
        >
          <RefreshCwIcon className={cn("size-3.5", isLoading && "animate-spin")} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
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
      </div>
    </div>
  );
}
