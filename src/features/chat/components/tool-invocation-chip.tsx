"use client";

import { ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AWAIT_TOOL_NAME, SHELL_TOOL_NAME } from "@/features/agent/tools/definitions";
import { getShellChipLabel } from "@/features/agent/tools/shell-display";
import type { MessageToolInvocation } from "@/lib/db";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";
import type { ToolUIPart } from "ai";
import {
  CheckCircle2Icon,
  CircleIcon,
  LoaderCircleIcon,
  XCircleIcon,
} from "lucide-react";
import { useState } from "react";

import { ShellToolOutput } from "./shell-tool-output";

type ToolInvocationChipProps = {
  invocation: MessageToolInvocation;
  className?: string;
};

export function ToolInvocationChip({
  invocation,
  className,
}: ToolInvocationChipProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const chipLabel =
    getShellChipLabel(invocation.name, invocation.input, invocation.output) ??
    invocation.name;
  const isShellTool =
    invocation.name === SHELL_TOOL_NAME || invocation.name === AWAIT_TOOL_NAME;

  return (
    <>
      <button
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2 py-1",
          "font-mono text-xs text-foreground transition-colors hover:bg-muted",
          className
        )}
        onClick={() => setOpen(true)}
        type="button"
      >
        <ToolStatusIcon state={invocation.state as ToolUIPart["state"]} />
        <span>{chipLabel}</span>
      </button>
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>
              {t("chat.toolDetailTitle", { name: invocation.name })}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-4">
            <ToolInput input={invocation.input} />
            {isShellTool && invocation.output ? (
              <ShellToolOutput output={invocation.output} />
            ) : null}
            <ToolOutput
              errorText={invocation.errorText}
              output={isShellTool ? undefined : invocation.output}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function ToolStatusIcon({ state }: { state: ToolUIPart["state"] }) {
  switch (state) {
    case "output-available":
      return (
        <CheckCircle2Icon className="size-3.5 shrink-0 text-green-600" />
      );
    case "output-error":
      return <XCircleIcon className="size-3.5 shrink-0 text-destructive" />;
    case "input-available":
      return (
        <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      );
    default:
      return <CircleIcon className="size-3.5 shrink-0 text-muted-foreground" />;
  }
}
