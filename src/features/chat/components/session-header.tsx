import {
  ChevronDown,
  LayoutPanelLeft,
  PanelRight,
  Sparkles,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type SessionHeaderProps = {
  title: string;
};

export function SessionHeader({ title }: SessionHeaderProps) {
  return (
    <header
      className="flex h-12 shrink-0 items-center justify-between border-b px-4"
      data-tauri-drag-region
    >
      <h1 className="truncate text-sm font-medium">{title}</h1>

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label="快速模式"
            >
              <Zap className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>快速模式</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="gap-1">
              提交
              <ChevronDown className="size-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>导出会话</DropdownMenuItem>
            <DropdownMenuItem>分享链接</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label="分屏布局"
            >
              <LayoutPanelLeft className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>分屏布局</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label="右侧面板"
            >
              <PanelRight className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>右侧面板</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label="工作台"
            >
              <Sparkles className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>工作台</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
