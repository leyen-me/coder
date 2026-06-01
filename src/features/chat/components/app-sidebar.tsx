import {
  ArrowLeft,
  ArrowRight,
  Blocks,
  PanelLeft,
  Plus,
  Search,
  Settings,
  Sparkles,
  Workflow,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
      <div
        className="flex h-11 shrink-0 items-center gap-0.5 px-2 pt-2"
        data-tauri-drag-region
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label="切换侧栏"
            >
              <PanelLeft className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">切换侧栏</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label="后退"
            >
              <ArrowLeft className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">后退</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label="前进"
            >
              <ArrowRight className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">前进</TooltipContent>
        </Tooltip>
      </div>

      <nav className="flex shrink-0 flex-col gap-0.5 px-2 pb-2">
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
