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
import { cn } from "@/lib/utils";

import { MOCK_CHAT_HISTORY } from "../data/mock-chats";
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
          <SidebarNavItem icon={Plus} label="新建聊天" isActive onClick={onNewChat} />
          <SidebarNavItem icon={Search} label="搜索" />
          <SidebarNavItem icon={Sparkles} label="技能" />
          <SidebarNavItem icon={Blocks} label="组件" />
          <SidebarNavItem icon={Workflow} label="自动化" />
        </nav>

        <Separator className="bg-sidebar-border" />

        <ChatHistoryList
          items={MOCK_CHAT_HISTORY}
          selectedId={selectedChatId}
          onSelect={onSelectChat}
        />

        <div className="shrink-0 border-t border-sidebar-border p-2">
          <SidebarNavItem
            icon={Settings}
            label="设置"
            onClick={onOpenSettings}
          />
        </div>
      </aside>
    </div>
  );
}
