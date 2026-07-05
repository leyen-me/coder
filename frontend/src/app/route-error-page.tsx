import {
  isRouteErrorResponse,
  Link,
  useRouteError,
} from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { NotFoundPage } from "./not-found-page";
import { paths } from "./paths";

export function RouteErrorPage() {
  const error = useRouteError();
  const { t } = useTranslation();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }

  const description = isRouteErrorResponse(error)
    ? error.statusText || t("pages.routeError.description")
    : error instanceof Error
      ? error.message
      : t("pages.routeError.description");

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="space-y-2">
        <h2 className="text-lg font-medium tracking-tight">
          {t("pages.routeError.title")}
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
          {t("pages.routeError.reload")}
        </Button>
        <Button asChild>
          <Link to={paths.chatNew}>{t("pages.notFound.backToChat")}</Link>
        </Button>
      </div>
    </main>
  );
}
