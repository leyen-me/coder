import { useState } from "react";
import {
  Plus,
  Search,
  Settings,
  Sparkles,
  Workflow,
} from "lucide-react";
import { useMatch } from "react-router-dom";

import { paths } from "@/app/paths";
import { APP_SIDEBAR_WIDTH_PX } from "@/components/layout/constants";
import { TitleBarDragRegion } from "@/components/layout/title-bar-drag-region";
import { Separator } from "@/components/ui/separator";
import { useGeneratingSessionTitles } from "@/features/agent/session-title-store";
import { useRunningSessionIds } from "@/features/agent/store/agent-store";
import { useChatSessions } from "@/features/chat/hooks/use-chat-sessions";
import { useLocale } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import { ChatHistoryList } from "./chat-history-list";
import { SearchDialog } from "./search-dialog";
import { SidebarNavItem } from "./sidebar-nav-item";

type AppSidebarProps = {
  open: boolean;
};

export function AppSidebar({ open }: AppSidebarProps) {
  const { t } = useLocale();
  const { sessions } = useChatSessions();
  const generatingTitleIds = useGeneratingSessionTitles();
  const runningSessionIds = useRunningSessionIds();
  const [searchOpen, setSearchOpen] = useState(false);

  const chatMatch = useMatch("/chat/:chatId");
  const selectedChatId =
    chatMatch?.params.chatId && chatMatch.params.chatId !== "new"
      ? chatMatch.params.chatId
      : null;

  return (
    <>
      <div
        style={{ width: open ? APP_SIDEBAR_WIDTH_PX : 0 }}
        className={cn(
          "flex h-full shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width,border-color] duration-300 ease-in-out",
          !open && "border-transparent"
        )}
        aria-hidden={!open}
      >
        <aside
          style={{ width: APP_SIDEBAR_WIDTH_PX }}
          className={cn(
            "flex h-full flex-col text-sidebar-foreground transition-opacity duration-300 ease-in-out",
            open ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        >
          <TitleBarDragRegion className="h-11 w-full shrink-0 flex-none" />

          <nav className="flex shrink-0 flex-col gap-0.5 px-2 pb-2">
            <SidebarNavItem
              icon={Plus}
              label={t("sidebar.newChat")}
              to={paths.chatNew}
              end
            />
            <SidebarNavItem
              icon={Search}
              label={t("sidebar.search")}
              onClick={() => setSearchOpen(true)}
            />
            <SidebarNavItem
              icon={Sparkles}
              label={t("sidebar.skills")}
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
            runningSessionIds={runningSessionIds}
          />

          <div className="shrink-0 border-t border-sidebar-border p-2">
            <SidebarNavItem
              icon={Settings}
              label={t("sidebar.settings")}
              to={paths.settings}
            />
          </div>
        </aside>
      </div>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
