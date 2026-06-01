import type { KeyboardEvent } from "react";
import {
  ArrowUp,
  ChevronDown,
  FolderGit2,
  FolderOpen,
  Laptop,
  Plus,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { DEFAULT_PROJECT_NAME } from "../data/mock-chats";

type PromptComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend?: () => void;
  className?: string;
};

export function PromptComposer({
  value,
  onChange,
  onSend,
  className,
}: PromptComposerProps) {
  const canSend = value.trim().length > 0;

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) {
        onSend?.();
      }
    }
  };

  return (
    <Card
      className={cn(
        "w-full max-w-3xl gap-0 overflow-hidden py-0 ring-1 ring-border",
        className
      )}
    >
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入任务，@ 引用文件，/ 使用命令，? 查看技能"
        className="min-h-[120px] resize-none rounded-none border-0 bg-transparent px-4 py-4 text-base shadow-none focus-visible:ring-0"
      />

      <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label="添加附件"
          >
            <Plus className="size-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground"
              >
                默认权限
                <ChevronDown className="size-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem>默认权限</DropdownMenuItem>
              <DropdownMenuItem>只读</DropdownMenuItem>
              <DropdownMenuItem>需确认后执行</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground"
              >
                GPT-4o
                <ChevronDown className="size-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>GPT-4o</DropdownMenuItem>
              <DropdownMenuItem>Claude Sonnet</DropdownMenuItem>
              <DropdownMenuItem>Composer</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-w-8 text-muted-foreground"
              >
                中
                <ChevronDown className="size-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>中文</DropdownMenuItem>
              <DropdownMenuItem>English</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            type="button"
            size="icon"
            className="rounded-full"
            disabled={!canSend}
            onClick={onSend}
            aria-label="发送"
          >
            <ArrowUp className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t bg-muted/40 px-3 py-2">
        <Badge variant="secondary" className="gap-1 rounded-md px-2 py-1 font-normal">
          <FolderOpen className="size-3" />
          {DEFAULT_PROJECT_NAME}
        </Badge>
        <Badge variant="secondary" className="gap-1 rounded-md px-2 py-1 font-normal">
          <Laptop className="size-3" />
          本地工作
        </Badge>
        <Badge variant="secondary" className="gap-1 rounded-md px-2 py-1 font-normal">
          <FolderGit2 className="size-3" />
          main
        </Badge>
      </div>
    </Card>
  );
}
