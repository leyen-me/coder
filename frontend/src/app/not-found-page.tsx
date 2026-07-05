import { Link, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { paths } from "./paths";

export function NotFoundPage() {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h2 className="text-lg font-medium tracking-tight">
          {t("pages.notFound.title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("pages.notFound.description")}
        </p>
        <p className="font-mono text-xs text-muted-foreground/80">{pathname}</p>
      </div>
      <Button asChild>
        <Link to={paths.chatNew}>{t("pages.notFound.backToChat")}</Link>
      </Button>
    </main>
  );
}
