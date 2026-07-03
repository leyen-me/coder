"use client";

import { paths } from "@/app/paths";
import {
  extractHandoffArtifactFromContinuationPrompt,
  parseStoredHandoffArtifact,
} from "@/features/agent/handoff";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";
import { PlayCircleIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { HandoffArtifactBlock } from "./handoff-artifact-block";

type HandoffContinuationMessageProps = {
  content: string;
  sourceSessionId?: string | null;
  className?: string;
};

export function HandoffContinuationMessage({
  content,
  sourceSessionId,
  className,
}: HandoffContinuationMessageProps) {
  const { t } = useTranslation();
  const artifactContent =
    extractHandoffArtifactFromContinuationPrompt(content) ?? content;
  const parsed = parseStoredHandoffArtifact(artifactContent);
  const resolvedSourceSessionId =
    sourceSessionId ?? parsed?.sourceSessionId ?? null;
  const sourceTitle = parsed?.sourceSessionTitle?.trim() || null;

  return (
    <div className={cn("w-full space-y-3", className)}>
      <div className="overflow-hidden rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 dark:bg-primary/10">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <PlayCircleIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium text-foreground text-sm">
              {t("chat.handoffContinuationSummary")}
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {t("chat.handoffContinuationDescription")}
            </p>
            {resolvedSourceSessionId ? (
              <Link
                className="inline-flex text-primary text-sm underline-offset-4 hover:underline"
                to={paths.chat(resolvedSourceSessionId)}
              >
                {sourceTitle
                  ? t("chat.handoffViewSourceSessionNamed", { title: sourceTitle })
                  : t("chat.handoffViewSourceSession")}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
      <HandoffArtifactBlock content={artifactContent} defaultOpen={false} />
    </div>
  );
}
