"use client";

import {
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  ClipboardListIcon,
  CopyIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import { subscribePlanFileUpdated } from "@/features/plan/plan-events";
import {
  formatPlanTabLabel,
  getLatestWorkspacePlan,
} from "@/features/plan/plan-service";
import type { PlanBuildActions } from "@/features/right-panel/right-panel-context";

type PlanSheetProps = {
  workspaceDir: string | null;
  planBuildActions: PlanBuildActions | null;
};

/**
 * Inline collapsible sheet above the prompt composer that shows the latest
 * plan content. Collapsed shows a compact header with plan name and Build
 * button; expanded renders the full plan markdown.
 */
export function PlanSheet({
  workspaceDir,
  planBuildActions,
}: PlanSheetProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const canBuild =
    Boolean(content.trim()) &&
    Boolean(planBuildActions?.onBuild) &&
    !planBuildActions?.isRunning;

  const loadLatest = useCallback(async (dir: string) => {
    setIsLoading(true);
    try {
      const latest = await getLatestWorkspacePlan(dir);
      if (latest?.content?.trim()) {
        setResolvedName(latest.name);
        setContent(latest.content);
      } else {
        setResolvedName(latest?.name ?? null);
        setContent("");
      }
    } catch {
      setContent("");
      setResolvedName(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load on mount / workspace change
  useEffect(() => {
    if (!workspaceDir) {
      setContent("");
      setResolvedName(null);
      return;
    }

    void loadLatest(workspaceDir);
  }, [loadLatest, workspaceDir]);

  // Subscribe to plan file updates
  useEffect(() => {
    return subscribePlanFileUpdated((detail) => {
      if (!workspaceDir) {
        return;
      }

      if (detail.action === "deleted") {
        void loadLatest(workspaceDir);
        return;
      }

      void loadLatest(workspaceDir).then(() => {
        setOpen(true);
      });
    });
  }, [loadLatest, workspaceDir]);

  // Close when workspace is cleared
  useEffect(() => {
    if (!workspaceDir) {
      setOpen(false);
    }
  }, [workspaceDir]);

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

  const hasPlan = Boolean(content.trim());
  if (!hasPlan && !isLoading) {
    return null;
  }

  const headerLabel = resolvedName
    ? formatPlanTabLabel(resolvedName)
    : t("rightPanel.planManager");

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="mb-2 overflow-hidden rounded-2xl border bg-muted/40 dark:bg-muted/20"
    >
      <CollapsibleTrigger
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 dark:hover:bg-muted/30"
        aria-label={open ? t("chat.todoCollapse") : t("chat.todoExpand")}
      >
        <ClipboardListIcon className="size-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 text-foreground text-sm font-medium">
          {headerLabel}
        </p>

        {!open && (
          <span className="max-w-[30%] truncate text-muted-foreground text-xs">
            {content
              .replace(/^#+\s*/u, "")
              .split("\n")
              .find((l) => l.trim())
              ?.trim() ?? ""}
          </span>
        )}

        <span
          className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
        >
          {t("rightPanel.planSaved")}
        </span>

        {canBuild ? (
          <button
            aria-label={t("chat.buildWithAgent")}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-primary/10 px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:pointer-events-none disabled:opacity-50"
            disabled={planBuildActions?.isBuildPending}
            onClick={(e) => {
              e.stopPropagation();
              planBuildActions?.onBuild();
            }}
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
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              void handleCopy();
            }}
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

        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open ? "rotate-180" : "rotate-0"
          )}
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="border-t px-3 py-3">
        <div className="max-h-[40vh] overflow-y-auto">
          <MarkdownRenderer>{content}</MarkdownRenderer>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
