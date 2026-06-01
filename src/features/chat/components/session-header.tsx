import { useTranslation } from "@/lib/i18n/locale-provider";

import { SessionToolbar } from "./session-toolbar";

type SessionHeaderProps = {
  title?: string;
};

export function SessionHeader({ title }: SessionHeaderProps) {
  const { t } = useTranslation();

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
      <h1 className="truncate text-sm font-medium">
        {title ?? t("session.newChat")}
      </h1>
      <SessionToolbar />
    </header>
  );
}
