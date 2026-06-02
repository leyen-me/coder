import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

type SessionTitleLabelProps = {
  title: string;
  isGenerating?: boolean;
  /** compact: sidebar row; header: top bar */
  variant?: "compact" | "header";
  className?: string;
};

export function SessionTitleLabel({
  title,
  isGenerating = false,
  variant = "compact",
  className,
}: SessionTitleLabelProps) {
  const { t } = useTranslation();

  const classNames = cn(
    "min-w-0 truncate",
    variant === "header" ? "text-sm font-medium" : "text-sm",
    isGenerating && "text-muted-foreground",
    className
  );

  if (variant === "header") {
    return (
      <h1
        className={classNames}
        aria-busy={isGenerating || undefined}
        aria-live={isGenerating ? "polite" : undefined}
        title={isGenerating ? t("session.generatingTitle") : title}
      >
        {title}
      </h1>
    );
  }

  return (
    <span
      className={classNames}
      aria-busy={isGenerating || undefined}
      title={isGenerating ? t("session.generatingTitle") : title}
    >
      {title}
    </span>
  );
}
