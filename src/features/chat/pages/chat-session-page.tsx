import { useParams } from "react-router-dom";

import { PagePlaceholder } from "@/components/layout/page-placeholder";
import { useTranslation } from "@/lib/i18n/locale-provider";

export function ChatSessionPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const { t } = useTranslation();

  return (
    <PagePlaceholder
      title={t("pages.chatSession.title", { id: chatId ?? "" })}
    />
  );
}
