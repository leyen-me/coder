import {
  Blocks,
  Plus,
  Search,
  Settings,
  Sparkles,
  Workflow,
} from "lucide-react";

import { Separator } from "@/components/ui/separator";

import { MOCK_CHAT_HISTORY } from "../data/mock-chats";
import { ChatHistoryList } from "./chat-history-list";
import { SidebarNavItem } from "./sidebar-nav-item";

type AppSidebarProps = {
  selectedChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
};

export function AppSidebar({
  selectedChatId,
  onSelectChat,
  onNewChat,
}: AppSidebarProps) {
  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
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
        <SidebarNavItem icon={Settings} label="设置" />
      </div>
    </aside>
  );
}
