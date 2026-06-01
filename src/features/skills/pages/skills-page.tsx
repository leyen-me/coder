import { PagePlaceholder } from "@/components/layout/page-placeholder";
import { useTranslation } from "@/lib/i18n/locale-provider";

export function SkillsPage() {
  const { t } = useTranslation();

  return <PagePlaceholder title={t("pages.skills.title")} />;
}
