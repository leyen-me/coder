import { PagePlaceholder } from "@/components/layout/page-placeholder";
import { useTranslation } from "@/lib/i18n/locale-provider";

type ChatSessionViewProps = {
  chatId: string;
};

export function ChatSessionView({ chatId }: ChatSessionViewProps) {
  const { t } = useTranslation();

  return (
    <PagePlaceholder title={t("pages.chatSession.title", { id: chatId })} />
  );
}
