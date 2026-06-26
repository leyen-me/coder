import { useCallback, useEffect, useState } from "react";

import {
  formatRelativeTime,
  listSessions,
  subscribeDb,
  type ChatHistoryItem,
  type SessionRecord,
} from "@/lib/db";
import { useTranslation } from "@/lib/i18n/locale-provider";

function toHistoryItem(
  session: SessionRecord,
  t: ReturnType<typeof useTranslation>["t"]
): ChatHistoryItem {
  return {
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt,
    workspaceDir: session.workspaceDir,
    sessionKind: session.sessionKind,
    pinnedAt: session.pinnedAt ?? null,
    relativeTime: formatRelativeTime(session.updatedAt, Date.now(), {
      justNow: t("time.justNow"),
      minutesAgo: (count) => t("time.minutesAgo", { count }),
      hoursAgo: (count) => t("time.hoursAgo", { count }),
      daysAgo: (count) => t("time.daysAgo", { count }),
      weeksAgo: (count) => t("time.weeksAgo", { count }),
      monthsAgo: (count) => t("time.monthsAgo", { count }),
    }),
  };
}

export function useChatSessions(limit = 50) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<ChatHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const records = await listSessions(limit);
    setSessions(records.map((session) => toHistoryItem(session, t)));
    setIsLoading(false);
  }, [limit, t]);

  useEffect(() => {
    void refresh();
    return subscribeDb(() => {
      void refresh();
    });
  }, [refresh]);

  return { sessions, isLoading, refresh };
}
