"use client";

import {
  BotIcon,
  ChevronDownIcon,
  ClipboardListIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

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
  isPlanNotFoundError,
  readWorkspacePlan,
} from "@/features/plan/plan-service";
type PlanBuildActions = {
  isRunning: boolean;
  isBuildPending: boolean;
  onBuild: () => void;
};

type PlanSheetProps = {
  workspaceDir: string | null;
  planFileName: string | null;
  planBuildActions: PlanBuildActions | null;
  /** When set, the plan has already been built and the Build button is disabled. */
  planBuiltAt?: number | null;
};

/**
 * Inline collapsible sheet above the prompt composer that shows the
 * current session's bound plan file content. Content is loaded from
 * the .plan/ directory using the file name stored in the session.
 */
export function PlanSheet({
  workspaceDir,
  planFileName,
  planBuildActions,
  planBuiltAt,
}: PlanSheetProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const isEmpty = !content.trim();
  const canBuild =
    !planBuiltAt &&
    !isEmpty &&
    Boolean(planBuildActions?.onBuild) &&
    !planBuildActions?.isRunning;

  // Load plan file content when planFileName or workspaceDir changes
  useEffect(() => {
    if (!workspaceDir || !planFileName) {
      setContent("");
      setLoadError(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError(false);

    void readWorkspacePlan(workspaceDir, planFileName)
      .then((result) => {
        if (!cancelled) {
          setContent(result.content);
          setIsLoading(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          if (isPlanNotFoundError(error)) {
            setContent("");
            setLoadError(true);
          } else {
            setContent("");
            setLoadError(true);
          }
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceDir, planFileName]);

  // Refresh when plan file is updated externally
  useEffect(() => {
    return subscribePlanFileUpdated((detail) => {
      if (!workspaceDir || !planFileName) {
        return;
      }

      if (detail.name !== planFileName) {
        return;
      }

      if (detail.action === "deleted") {
        setContent("");
        setLoadError(true);
        return;
      }

      // Reload the updated content
      void readWorkspacePlan(workspaceDir, planFileName)
        .then((result) => {
          setContent(result.content);
          setOpen(true);
          setLoadError(false);
        })
        .catch(() => {
          setContent("");
          setLoadError(true);
        });
    });
  }, [workspaceDir, planFileName]);

  // Don't render if we don't have a plan, or the file was deleted
  if (!planFileName || loadError) {
    return null;
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="mb-2 flex items-center gap-2 overflow-hidden rounded-2xl border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground dark:bg-muted/20">
        <ClipboardListIcon className="size-4 shrink-0" />
        <span>{t("rightPanel.planLoading")}</span>
      </div>
    );
  }

  const headerLabel = formatPlanTabLabel(planFileName);

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
