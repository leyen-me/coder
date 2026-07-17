import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { listSessions, deleteSession } from "@/lib/db";
import { getChatDataStats } from "@/lib/db/clear-chat-data";
import { cn } from "@/lib/utils";

import { SettingRow } from "./setting-row";

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
  const [stats, setStats] = useState<{
    sessionCount: number;
    messageCount: number;
    storageSize: number;
  } | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [confirmBatchDeleteOpen, setConfirmBatchDeleteOpen] = useState(false);
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof listSessions>>>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, st] = await Promise.all([listSessions(), getChatDataStats()]);
      setSessions(s);
      setStats(st);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleClearAll = useCallback(async () => {
    navigate(paths.home, { replace: true });
    const { clearAllChatData } = await import("@/lib/db");
    await clearAllChatData();
    setClearAllOpen(false);
  }, [navigate]);

  const toggleSession = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === sessions.length) return new Set();
      return new Set(sessions.map((s) => s.id));
    });
  }, [sessions]);

  const handleBatchDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    await Promise.all(ids.map((id) => deleteSession(id)));
    toast.success(t("settings.data.batchDeleteSuccess", { count: ids.length }));
    setSelectedIds(new Set());
    setConfirmBatchDeleteOpen(false);
    setBatchDeleteOpen(false);
    await loadData();
  }, [selectedIds, t, loadData]);

  const allSelected = sessions.length > 0 && selectedIds.size === sessions.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        {t("search.loading")}
      </div>
    );
  }

  return (
    <section className="divide-y">
      {/* ---- Clear all ---- */}
      <SettingRow
        label={t("settings.data.clearChatHistoryLabel")}
        description={
          stats
            ? t("settings.data.clearChatHistoryDescription", {
                sessionCount: stats.sessionCount,
                messageCount: stats.messageCount,
                storageSize: formatStorageSize(stats.storageSize),
              })
            : ""
        }
        control={
          <Button
            disabled={!stats || stats.sessionCount === 0}
            onClick={() => setClearAllOpen(true)}
            size="sm"
            type="button"
            variant="destructive"
          >
            {t("settings.data.clearButton")}
          </Button>
        }
      />

      {/* ---- Batch delete trigger ---- */}
      <SettingRow
        label={t("settings.data.batchDeleteLabel")}
        description={t("settings.data.batchDeleteDescription")}
        control={
          <Button
            disabled={sessions.length === 0}
            onClick={() => setBatchDeleteOpen(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("settings.data.batchDeleteOpen")}
          </Button>
        }
      />

      {/* ---- Batch delete dialog ---- */}
      <Dialog onOpenChange={setBatchDeleteOpen} open={batchDeleteOpen}>
        <DialogContent className="overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="truncate">{t("settings.data.batchDeleteLabel")}</DialogTitle>
          </DialogHeader>

          <div className="min-w-0 space-y-3 overflow-hidden">
            <div className="flex min-w-0 items-center gap-2 overflow-hidden rounded-md bg-muted/40 px-3 py-2">
              <Checkbox
                checked={allSelected}
                className="shrink-0"
                id="select-all"
                onCheckedChange={toggleAll}
              />
              <label
                className="min-w-0 flex-1 cursor-pointer truncate text-sm font-medium"
                htmlFor="select-all"
              >
                {allSelected
                  ? t("settings.data.deselectAll")
                  : t("settings.data.selectAll", { count: sessions.length })}
              </label>
              {selectedIds.size > 0 && (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {t("settings.data.selectedCount", { count: selectedIds.size })}
                </span>
              )}
            </div>

            <ScrollArea className="h-72 w-full min-w-0">
              <div className="w-full min-w-0 space-y-0.5 pr-2">
                {sessions.map((session) => (
                  <label
                    key={session.id}
                    className={cn(
                      "flex w-full min-w-0 cursor-pointer items-center gap-2 overflow-hidden rounded-md px-3 py-2 transition-colors hover:bg-muted/40",
                      selectedIds.has(session.id) && "bg-muted/60",
                    )}
                  >
                    <Checkbox
                      checked={selectedIds.has(session.id)}
                      className="shrink-0"
                      onCheckedChange={() => toggleSession(session.id)}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {session.title || session.id.slice(0, 8)}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {new Date(session.createdAt).toLocaleDateString()}
                    </span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter className="min-w-0 flex-wrap sm:justify-end">
            <Button
              onClick={() => setBatchDeleteOpen(false)}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("settings.data.confirmCancel")}
            </Button>
            <Button
              disabled={selectedIds.size === 0}
              onClick={() => {
                setConfirmBatchDeleteOpen(true);
              }}
              size="sm"
              type="button"
              variant="destructive"
            >
              {t("settings.data.batchDeleteButton", { count: selectedIds.size })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Batch delete confirmation dialog ---- */}
      <Dialog onOpenChange={setConfirmBatchDeleteOpen} open={confirmBatchDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("settings.data.batchDeleteConfirmTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("settings.data.batchDeleteConfirmDescription", { count: selectedIds.size })}
          </p>
          <DialogFooter>
            <Button
              onClick={() => setConfirmBatchDeleteOpen(false)}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("settings.data.confirmCancel")}
            </Button>
            <Button
              onClick={handleBatchDelete}
              size="sm"
              type="button"
              variant="destructive"
            >
              {t("settings.data.batchDeleteConfirmAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Clear all confirmation dialog ---- */}
      <Dialog onOpenChange={setClearAllOpen} open={clearAllOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("settings.data.confirmTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("settings.data.confirmDescription")}
          </p>
          <DialogFooter>
            <Button
              onClick={() => setClearAllOpen(false)}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("settings.data.confirmCancel")}
            </Button>
            <Button
              onClick={handleClearAll}
              size="sm"
              type="button"
              variant="destructive"
            >
              {t("settings.data.confirmAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
