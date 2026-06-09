"use client";

import { useTranslation } from "@/lib/i18n/locale-provider";

export function BrowserTabPlaceholder() {
  const { t } = useTranslation();

  return (
    <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
      {t("rightPanel.browserPlaceholder")}
    </div>
  );
}
