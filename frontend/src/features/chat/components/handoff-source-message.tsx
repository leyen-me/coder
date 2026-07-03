"use client";

import { paths } from "@/app/paths";
import { parseStoredHandoffArtifact } from "@/features/agent/handoff";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";
import { ArrowRightLeftIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { HandoffArtifactBlock } from "./handoff-artifact-block";
import { resolveHandoffContinuationTitle } from "./handoff-source-banner";

type HandoffSourceMessageProps = {
  content: string;
  className?: string;
};

export function HandoffSourceMessage({ content, className }: HandoffSourceMessageProps) {
  const { t } = useTranslation();
  const parsed = parseStoredHandoffArtifact(content);
  const continuedSessionId = parsed?.continuedSessionId ?? null;
  const continuedTitle = resolveHandoffContinuationTitle({
    sourceSessionTitle: parsed?.sourceSessionTitle,
  });

  return (
    <div className={cn("w-full space-y-3", className)}>
      {continuedSessionId ? (
        <div className="overflow-hidden rounded-2xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 dark:bg-amber-500/10">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
              <ArrowRightLeftIcon className="size-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-medium text-foreground text-sm">
                {t("chat.handoffSourceSummary")}
              </p>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {t("chat.handoffSourceDescription")}
              </p>
              <Link
                className="inline-flex text-amber-700 text-sm underline-offset-4 hover:underline dark:text-amber-300"
                to={paths.chat(continuedSessionId)}
              >
                {continuedTitle
                  ? t("chat.handoffViewContinuationSessionNamed", {
                      title: continuedTitle,
                    })
                  : t("chat.handoffViewContinuationSession")}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
      <HandoffArtifactBlock content={content} defaultOpen={false} />
    </div>
  );
}
