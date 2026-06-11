import {
  CheckIcon,
  CircleDashedIcon,
  CircleIcon,
  LoaderCircleIcon,
  XIcon,
} from "lucide-react";
import { useMemo } from "react";

import { useTranslation } from "@/lib/i18n/locale-provider";
import type { AgentTodoRecord, AgentTodoStatus } from "@/lib/db";

import { useSessionTodos } from "../hooks/use-session-todos";

type AgentTodoListProps = {
  sessionId: string;
  isRunning?: boolean;
};

function TodoStatusIcon({ status }: { status: AgentTodoStatus }) {
  switch (status) {
    case "completed":
      return (
        <CheckIcon className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      );
    case "in_progress":
      return (
        <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin text-foreground/80" />
      );
    case "cancelled":
      return (
        <XIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
      );
    default:
      return (
        <CircleIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
      );
  }
}

function useTodoStatusLabel(status: AgentTodoStatus): string {
  const { t } = useTranslation();

  switch (status) {
    case "completed":
      return t("chat.todoStatusCompleted");
    case "in_progress":
      return t("chat.todoStatusInProgress");
    case "cancelled":
      return t("chat.todoStatusCancelled");
    default:
      return t("chat.todoStatusPending");
  }
}

export function AgentTodoList({ sessionId, isRunning = false }: AgentTodoListProps) {
  const { t } = useTranslation();
  const { todos, isLoading } = useSessionTodos(sessionId);

  const stats = useMemo(() => {
    const completed = todos.filter((todo) => todo.status === "completed").length;
    return { completed, total: todos.length };
  }, [todos]);

  if (isLoading || todos.length === 0) {
    return null;
  }

  return (
    <div className="mb-2 overflow-hidden rounded-2xl border bg-muted/40 px-3 py-2.5 dark:bg-muted/20">
      <div className="flex items-center gap-2">
        <CircleDashedIcon className="size-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 text-foreground text-sm font-medium">
          {t("chat.todoListTitle")}
        </p>
        <span className="shrink-0 text-muted-foreground text-xs">
          {t("chat.todoProgress", {
            completed: stats.completed,
            total: stats.total,
          })}
        </span>
      </div>

      <ul className="mt-2 space-y-1.5">
        {todos.map((todo) => (
          <TodoRow key={todo.id} todo={todo} isRunning={isRunning} />
        ))}
      </ul>
    </div>
  );
}

type TodoRowProps = {
  todo: AgentTodoRecord;
  isRunning: boolean;
};

function TodoRow({ todo, isRunning }: TodoRowProps) {
  const statusLabel = useTodoStatusLabel(todo.status);
  const isActive = todo.status === "in_progress";
  const isDone = todo.status === "completed" || todo.status === "cancelled";

  return (
    <li
      className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm ${
        isActive && isRunning
          ? "bg-background/80 ring-1 ring-foreground/10"
          : "bg-transparent"
      }`}
    >
      <span className="mt-0.5">
        <TodoStatusIcon status={todo.status} />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`leading-snug ${
            isDone ? "text-muted-foreground line-through" : "text-foreground"
          }`}
        >
          {todo.content}
        </p>
        <p className="mt-0.5 text-muted-foreground text-xs">{statusLabel}</p>
      </div>
    </li>
  );
}
