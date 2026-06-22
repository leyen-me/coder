"use client";

import { formatTodoOutputForDisplay } from "@/features/agent/tools/todo-display";
import { cn } from "@/lib/utils";
import type { ToolUIPart } from "ai";
import {
  CheckCircle2Icon,
  CircleDotIcon,
  CircleIcon,
  CircleOffIcon,
  ListTodoIcon,
} from "lucide-react";

import { CollapsibleToolSection } from "@/components/ai-elements/collapsible-tool-section";
import { ToolStatusIcon } from "@/features/chat/components/tool-status-icon";

type TodoToolOutputProps = {
  output: unknown;
  input: unknown;
  toolName: string;
  state: ToolUIPart["state"];
  errorText?: string;
  className?: string;
};

const statusConfig: Record<
  string,
  {
    icon: typeof CheckCircle2Icon;
    label: string;
    color: string;
  }
> = {
  completed: {
    icon: CheckCircle2Icon,
    label: "Done",
    color: "text-green-600",
  },
  in_progress: {
    icon: CircleDotIcon,
    label: "In progress",
    color: "text-blue-600",
  },
  pending: {
    icon: CircleIcon,
    label: "Pending",
    color: "text-muted-foreground",
  },
  cancelled: {
    icon: CircleOffIcon,
    label: "Cancelled",
    color: "text-muted-foreground/50",
  },
};

export function TodoToolOutput({
  output,
  input: _input,
  toolName,
  state,
  errorText,
  className,
}: TodoToolOutputProps) {
  const formatted = formatTodoOutputForDisplay(output);
  const isError = state === "output-error" && errorText;
  void _input;

  const completedPct =
    formatted && formatted.total > 0
      ? Math.round((formatted.completed / formatted.total) * 100)
      : 0;

  return (
    <CollapsibleToolSection
      className={className}
      errorText={isError ? errorText : undefined}
      header={
        <>
          <ToolStatusIcon state={state} />
          <span className="font-mono font-medium text-foreground">
            {toolName}
          </span>
          {formatted ? (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-muted-foreground">
                {formatted.total} todo{formatted.total !== 1 ? "s" : ""}
              </span>
              {formatted.active > 0 ? (
                <span className="rounded-full bg-blue-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-blue-600">
                  {formatted.active} active
                </span>
              ) : null}
              {formatted.completed > 0 ? (
                <span className="rounded-full bg-green-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-green-600">
                  {formatted.completed} done
                </span>
              ) : null}
              {formatted.merge != null && formatted.removed != null && formatted.removed.length > 0 ? (
                <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-amber-600">
                  {formatted.removed.length} removed
                </span>
              ) : null}
            </>
          ) : null}
        </>
      }
    >
      {/* Progress bar */}
      {formatted && formatted.total > 0 ? (
        <div className="border-b bg-muted/20 px-3 py-2">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium text-muted-foreground">
              Progress
            </span>
            <span className="font-mono text-muted-foreground/70">
              {formatted.completed}/{formatted.total} ({completedPct}%)
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-500"
              style={{ width: `${completedPct}%` }}
            />
          </div>
        </div>
      ) : null}

      {/* Todo list */}
      {formatted && formatted.todos.length > 0 ? (
        <div className="max-h-80 divide-y overflow-y-auto">
          {formatted.todos.map((todo) => {
            const config = statusConfig[todo.status] ?? statusConfig.pending;
            const StatusIcon = config.icon;
            return (
              <div
                key={todo.id}
                className="flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/20"
              >
                <StatusIcon
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    config.color,
                    todo.status === "in_progress" && "animate-pulse",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm leading-relaxed",
                      todo.status === "completed" &&
                        "text-muted-foreground line-through",
                      todo.status === "cancelled" &&
                        "text-muted-foreground/50 line-through",
                    )}
                  >
                    {todo.content}
                  </p>
                  <span className="mt-0.5 inline-block font-mono text-[10px] text-muted-foreground/50">
                    {config.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Empty state */}
      {formatted && formatted.todos.length === 0 && !isError ? (
        <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
          <ListTodoIcon className="size-4" />
          <span>No todos</span>
        </div>
      ) : null}
    </CollapsibleToolSection>
  );
}
