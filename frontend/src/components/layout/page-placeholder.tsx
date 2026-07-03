import { useTranslation } from "@/lib/i18n/locale-provider";

type PagePlaceholderProps = {
  title: string;
};

/** Minimal full-page placeholder until a feature route is implemented. */
export function PagePlaceholder({ title }: PagePlaceholderProps) {
  const { t } = useTranslation();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6">
      <h2 className="text-lg font-medium tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{t("pages.comingSoon")}</p>
    </main>
  );
}
