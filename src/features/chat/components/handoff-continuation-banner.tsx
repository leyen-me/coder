"use client";

import { paths } from "@/app/paths";
import { getSession } from "@/lib/db";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";
import { ArrowRightLeftIcon, ExternalLinkIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type HandoffContinuationBannerProps = {
  fromSessionId: string;
  className?: string;
};

export function HandoffContinuationBanner({
  fromSessionId,
  className,
}: HandoffContinuationBannerProps) {
  const { t } = useTranslation();
  const [sourceTitle, setSourceTitle] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      const session = await getSession(fromSessionId);
      if (!active) {
        return;
      }

      setSourceTitle(session?.title?.trim() || null);
    })();

    return () => {
      active = false;
    };
  }, [fromSessionId]);

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
            {t("chat.handoffContinuationBannerTitle")}
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {t("chat.handoffContinuationBannerDescription")}
          </p>
          <Link
            className="inline-flex items-center gap-1.5 text-amber-700 text-sm underline-offset-4 hover:underline dark:text-amber-300"
            to={paths.chat(fromSessionId)}
          >
            <ExternalLinkIcon className="size-3.5" />
            {sourceTitle
              ? t("chat.handoffViewSourceSessionNamed", { title: sourceTitle })
              : t("chat.handoffViewSourceSession")}
          </Link>
        </div>
      </div>
    </div>
  );
}
