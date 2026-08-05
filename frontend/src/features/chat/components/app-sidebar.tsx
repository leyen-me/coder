import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Settings,
  Sparkles,
  Workflow,
} from "lucide-react";
import { useMatch } from "react-router-dom";
import { toast } from "sonner";

import { paths } from "@/app/paths";
import { TitleBarDragRegion } from "@/components/layout/title-bar-drag-region";
import { ResponsiveSidebarPanel } from "@/components/layout/responsive-sidebar-panel";
import { Separator } from "@/components/ui/separator";
import { useGeneratingSessionTitles } from "@/features/agent/session-title-store";
import { useRunningSessionIds } from "@/features/agent/store/agent-store";
import { useChatSessions } from "@/features/chat/hooks/use-chat-sessions";
import { ExportSessionDialog } from "@/features/chat/components/export-session-dialog";
import { listActiveScheduledRuns } from "@/features/scheduled-jobs/lib/api";
import { deleteSession, pinSession, unpinSession, updateSessionTitle } from "@/lib/db";
import { useLocale } from "@/lib/i18n/locale-provider";

import { useSearchDialog } from "@/features/keyboard-shortcuts/search-dialog-context";

import { ChatHistoryList } from "./chat-history-list";
import { SidebarNavItem } from "./sidebar-nav-item";
import { SidebarThemeToggle } from "./sidebar-theme-toggle";

type AppSidebarProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const ACTIVE_RUNS_POLL_MS = 3000;

export function AppSidebar({ open, onOpenChange }: AppSidebarProps) {
  const { t } = useLocale();
  const { sessions, refresh } = useChatSessions();
  const generatingTitleIds = useGeneratingSessionTitles();
  const runningSessionIds = useRunningSessionIds();
  const [automationRunningSessionIds, setAutomationRunningSessionIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [exportSessionId, setExportSessionId] = useState<string | null>(null);
  const { open: openSearch } = useSearchDialog();

  const chatMatch = useMatch("/chat/:chatId");
  const selectedChatId =
    chatMatch?.params.chatId && chatMatch.params.chatId !== "new"
      ? chatMatch.params.chatId
      : null;

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      await deleteSession(sessionId);
      await refresh();
      toast.success(t("sidebar.deleteChatSuccess"));
    },
    [refresh, t]
  );

  const handleExportSession = useCallback((sessionId: string) => {
    setExportSessionId(sessionId);
  }, []);

  const handleRenameSession = useCallback(
    async (sessionId: string, title: string) => {
      await updateSessionTitle(sessionId, title);
      await refresh();
    },
    [refresh]
  );

  const handlePinSession = useCallback(
    async (sessionId: string) => {
      await pinSession(sessionId);
      await refresh();
    },
    [refresh]
  );

  const handleUnpinSession = useCallback(
    async (sessionId: string) => {
      await unpinSession(sessionId);
      await refresh();
    },
    [refresh]
  );

  useEffect(() => {
    let mounted = true;

    const syncActiveRuns = async () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      try {
        const runs = await listActiveScheduledRuns();
        if (!mounted) {
          return;
        }
        setAutomationRunningSessionIds(
          new Set(
            runs
              .map((run) => run.sessionId.trim())
              .filter((sessionId) => sessionId.length > 0)
          )
        );
      } catch {
        if (mounted) {
          setAutomationRunningSessionIds(new Set());
        }
      }
    };

    void syncActiveRuns();
    const timer = window.setInterval(() => {
      void syncActiveRuns();
    }, ACTIVE_RUNS_POLL_MS);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const combinedRunningSessionIds = useMemo(() => {
    const ids = new Set(runningSessionIds);
    for (const sessionId of automationRunningSessionIds) {
      ids.add(sessionId);
    }
    return ids;
  }, [automationRunningSessionIds, runningSessionIds]);

  return (
    <ResponsiveSidebarPanel
      open={open}
      onOpenChange={onOpenChange}
      ariaLabel={t("sidebar.ariaLabel")}
    >
      <TitleBarDragRegion className="h-11 w-full shrink-0 flex-none" />

      <nav className="flex shrink-0 flex-col gap-0.5 px-2 pb-2">
        <SidebarNavItem
          icon={Plus}
          label={t("sidebar.newChat")}
          shortcutActionId="global.newChat"
          to={paths.chatNew}
          end
        />
        <SidebarNavItem
          icon={Search}
          label={t("sidebar.search")}
          onClick={openSearch}
          shortcutActionId="global.search"
        />
        <SidebarNavItem
          icon={Sparkles}
          label={t("sidebar.skills")}
          shortcutActionId="global.skills"
          to={paths.skills}
        />
        <SidebarNavItem
          icon={Workflow}
          label={t("sidebar.automations")}
          to={paths.automations}
        />
      </nav>

      <Separator className="bg-sidebar-border" />

      <ChatHistoryList
        items={sessions}
        selectedId={selectedChatId}
        generatingTitleIds={generatingTitleIds}
        runningSessionIds={combinedRunningSessionIds}
        onDeleteSession={handleDeleteSession}
        onExportSession={handleExportSession}
        onRenameSession={handleRenameSession}
        onPinSession={handlePinSession}
        onUnpinSession={handleUnpinSession}
      />

      <ExportSessionDialog
        sessionId={exportSessionId}
        open={exportSessionId !== null}
        onOpenChange={(open) => {
          if (!open) setExportSessionId(null);
        }}
      />

      <div className="flex shrink-0 flex-col gap-0.5 border-t border-sidebar-border p-2">
        <SidebarThemeToggle />
        <SidebarNavItem
          icon={Settings}
          label={t("sidebar.settings")}
          shortcutActionId="global.settings"
          to={paths.settings}
        />
      </div>
    </ResponsiveSidebarPanel>
  );
}
