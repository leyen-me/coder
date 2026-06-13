"use client";

import { paths } from "@/app/paths";
import { deriveContinuationSessionTitle } from "@/features/agent/handoff";
import { getSession } from "@/lib/db";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";
import { ArrowRightLeftIcon, ExternalLinkIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type HandoffSourceBannerProps = {
  continuedSessionId: string;
  fallbackTitle?: string | null;
  className?: string;
};

export function HandoffSourceBanner({
  continuedSessionId,
  fallbackTitle,
  className,
}: HandoffSourceBannerProps) {
  const { t } = useTranslation();
  const [continuedTitle, setContinuedTitle] = useState<string | null>(
    fallbackTitle?.trim() || null
  );

  useEffect(() => {
    let active = true;

    void (async () => {
      const session = await getSession(continuedSessionId);
      if (!active) {
        return;
      }

      setContinuedTitle(session?.title?.trim() || fallbackTitle?.trim() || null);
    })();

    return () => {
      active = false;
    };
  }, [continuedSessionId, fallbackTitle]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 dark:bg-amber-500/10",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
          <ArrowRightLeftIcon className="size-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium text-foreground text-sm">
            {t("chat.handoffSourceBannerTitle")}
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {t("chat.handoffSourceBannerDescription")}
          </p>
          <Link
            className="inline-flex items-center gap-1.5 text-amber-700 text-sm underline-offset-4 hover:underline dark:text-amber-300"
            to={paths.chat(continuedSessionId)}
          >
            <ExternalLinkIcon className="size-3.5" />
            {continuedTitle
              ? t("chat.handoffViewContinuationSessionNamed", {
                  title: continuedTitle,
                })
              : t("chat.handoffViewContinuationSession")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export function resolveHandoffContinuationTitle(input: {
  sourceSessionTitle?: string | null;
  continuedSessionTitle?: string | null;
}): string | null {
  return (
    input.continuedSessionTitle?.trim() ||
    (input.sourceSessionTitle?.trim()
      ? deriveContinuationSessionTitle(input.sourceSessionTitle)
      : null)
  );
}
