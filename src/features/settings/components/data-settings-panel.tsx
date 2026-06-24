import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAgentStore } from "@/features/agent/store/agent-store";
import {
  clearAllChatData,
  getChatDataStats,
  subscribeDb,
  type ChatDataStats,
} from "@/lib/db";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { SettingRow } from "./setting-row";

const EMPTY_STATS: ChatDataStats = { sessionCount: 0, messageCount: 0, storageSize: 0 };

function formatStorageSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function DataSettingsPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeTasks, cancelTask } = useAgentStore();
  const [stats, setStats] = useState<ChatDataStats>(EMPTY_STATS);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const refreshStats = useCallback(async () => {
    setStats(await getChatDataStats());
  }, []);

  useEffect(() => {
    void refreshStats();
    return subscribeDb(() => {
      void refreshStats();
    });
  }, [refreshStats]);

  const hasChatData = stats.sessionCount > 0 || stats.messageCount > 0;

  const formattedSize =
    stats.storageSize > 0 ? formatStorageSize(stats.storageSize) : "";

  const handleClear = async () => {
    setIsClearing(true);
    try {
      await Promise.all(
        [...activeTasks.values()].map((task) => cancelTask(task.taskId))
      );
      await clearAllChatData();
      setConfirmOpen(false);
      navigate(paths.chatNew, { replace: true });
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <>
      <section className="divide-y">
        <SettingRow
          label={t("settings.data.clearChatHistoryLabel")}
          description={t("settings.data.clearChatHistoryDescription", {
            sessionCount: stats.sessionCount,
            messageCount: stats.messageCount,
            storageSize: formattedSize,
          })}
          control={
            <Button
              variant="destructive"
              disabled={!hasChatData || isClearing}
              onClick={() => setConfirmOpen(true)}
            >
              {t("settings.data.clearButton")}
            </Button>
          }
        />
      </section>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent showCloseButton={!isClearing}>
          <DialogHeader>
            <DialogTitle>{t("settings.data.confirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("settings.data.confirmDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isClearing}
              onClick={() => setConfirmOpen(false)}
            >
              {t("settings.data.confirmCancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={isClearing}
              onClick={() => void handleClear()}
            >
              {t("settings.data.confirmAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
