"use client";

import { ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import {
  Reasoning,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { CollapsibleContent } from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useTranslation } from "@/lib/i18n/locale-provider";
import type { MessageToolInvocation } from "@/lib/db";
import { cn } from "@/lib/utils";
import type { ToolUIPart } from "ai";
import {
  CheckCircle2Icon,
  CircleIcon,
  LoaderCircleIcon,
  XCircleIcon,
} from "lucide-react";
import { useCallback, useState } from "react";

import { StreamingPlainText } from "./streaming-message-content";

type ThinkingSegment =
  | {
      kind: "text";
      text: string;
    }
  | {
      kind: "tool";
      invocation: MessageToolInvocation;
    };

type ThinkingBlockProps = {
  segments: ThinkingSegment[];
  isStreaming: boolean;
};

export function ThinkingBlock({
  segments,
  isStreaming,
}: ThinkingBlockProps) {
  const { t } = useTranslation();

  const getThinkingMessage = useCallback(
    (streaming: boolean, duration?: number) => {
      if (streaming || duration === 0) {
        return <Shimmer duration={1}>{t("chat.thinkingInProgress")}</Shimmer>;
      }
      if (duration === undefined) {
        return <p>{t("chat.thinking")}</p>;
      }
      return <p>{t("chat.thoughtForSeconds", { duration })}</p>;
    },
    [t]
  );

  const narrative = (
    <ThinkingNarrative
      isStreaming={isStreaming}
      segments={segments}
    />
  );

  return (
    <Reasoning className="mb-0 w-full" isStreaming={isStreaming}>
      <ReasoningTrigger getThinkingMessage={getThinkingMessage} />
      <CollapsibleContent
        className={cn(
          "mt-4 text-sm",
          "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-muted-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in"
        )}
      >
        {narrative}
      </CollapsibleContent>
    </Reasoning>
  );
}

type ThinkingNarrativeProps = {
  segments: ThinkingSegment[];
  isStreaming: boolean;
};

function ThinkingNarrative({ segments, isStreaming }: ThinkingNarrativeProps) {
  const { t } = useTranslation();
  const hasVisibleContent = segments.some(
    (segment) =>
      segment.kind === "tool" ||
      (segment.kind === "text" && segment.text.trim().length > 0)
  );

  if (!hasVisibleContent && isStreaming) {
    return <Shimmer duration={1}>{t("chat.thinkingInProgress")}</Shimmer>;
  }

  if (!hasVisibleContent) {
    return <p>{t("chat.thinkingPlaceholder")}</p>;
  }

  return (
    <div className="space-y-3">
      {groupThinkingSegments(segments).map((group, index) => {
        if (group.kind === "tools") {
          return (
            <div
              className="flex flex-wrap gap-2"
              key={`tools:${group.invocations.map((invocation) => invocation.id).join(",")}`}
            >
              {group.invocations.map((invocation) => (
                <ToolLink invocation={invocation} key={invocation.id} />
              ))}
            </div>
          );
        }

        if (!group.text.trim()) {
          return null;
        }

        return (
          <StreamingPlainText
            isStreaming={isStreaming}
            key={`text:${index}`}
            text={group.text}
          />
        );
      })}
    </div>
  );
}

type ThinkingSegmentGroup =
  | { kind: "text"; text: string }
  | { kind: "tools"; invocations: MessageToolInvocation[] };

function groupThinkingSegments(
  segments: ThinkingSegment[]
): ThinkingSegmentGroup[] {
  const groups: ThinkingSegmentGroup[] = [];

  for (const segment of segments) {
    if (segment.kind === "text") {
      groups.push({ kind: "text", text: segment.text });
      continue;
    }

    const lastGroup = groups.at(-1);
    if (lastGroup?.kind === "tools") {
      lastGroup.invocations.push(segment.invocation);
      continue;
    }

    groups.push({ kind: "tools", invocations: [segment.invocation] });
  }

  return groups;
}

type ToolLinkProps = {
  invocation: MessageToolInvocation;
};

function ToolLink({ invocation }: ToolLinkProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2 py-1",
          "font-mono text-xs text-foreground transition-colors hover:bg-muted"
        )}
        onClick={() => setOpen(true)}
        type="button"
      >
        <ToolStatusIcon state={invocation.state as ToolUIPart["state"]} />
        <span>{invocation.name}</span>
      </button>
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{t("chat.toolDetailTitle", { name: invocation.name })}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-4">
            <ToolInput input={invocation.input} />
            <ToolOutput
              errorText={invocation.errorText}
              output={invocation.output}
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
