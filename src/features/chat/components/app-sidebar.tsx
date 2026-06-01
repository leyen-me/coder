import {
  Blocks,
  Plus,
  Search,
  Settings,
  Sparkles,
  Workflow,
} from "lucide-react";

import { APP_SIDEBAR_WIDTH_PX } from "@/components/layout/constants";
import { Separator } from "@/components/ui/separator";
import { useLocale } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import { ChatHistoryList } from "./chat-history-list";
import { SidebarNavItem } from "./sidebar-nav-item";

type AppSidebarProps = {
  open: boolean;
  selectedChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
};

export function AppSidebar({
  open,
  selectedChatId,
  onSelectChat,
  onNewChat,
  onOpenSettings,
}: AppSidebarProps) {
  const { messages, t } = useLocale();

  return (
    <div
      style={{ width: open ? APP_SIDEBAR_WIDTH_PX : 0 }}
      className={cn(
        "shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width,border-color] duration-300 ease-in-out",
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
        <nav className="flex shrink-0 flex-col gap-0.5 px-2 pb-2 pt-2">
          <SidebarNavItem
            icon={Plus}
            label={t("sidebar.newChat")}
            isActive
            onClick={onNewChat}
          />
          <SidebarNavItem icon={Search} label={t("sidebar.search")} />
          <SidebarNavItem icon={Sparkles} label={t("sidebar.skills")} />
          <SidebarNavItem icon={Blocks} label={t("sidebar.components")} />
          <SidebarNavItem icon={Workflow} label={t("sidebar.automations")} />
        </nav>

        <Separator className="bg-sidebar-border" />

        <ChatHistoryList
          items={messages.mockChats}
          selectedId={selectedChatId}
          onSelect={onSelectChat}
        />

        <div className="shrink-0 border-t border-sidebar-border p-2">
          <SidebarNavItem
            icon={Settings}
            label={t("sidebar.settings")}
            onClick={onOpenSettings}
          />
        </div>
      </aside>
    </div>
  );
}
