"use client";

import { Shimmer } from "@/components/ai-elements/shimmer";
import { useTranslation } from "@/lib/i18n/locale-provider";
import type { MessageToolInvocation } from "@/lib/db";

import { StreamingPlainText } from "./streaming-message-content";
import { ToolInvocationChip } from "./tool-invocation-chip";

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
  const hasVisibleContent = segments.some(
    (segment) =>
      segment.kind === "tool" ||
      (segment.kind === "text" && segment.text.trim().length > 0)
  );

  if (!hasVisibleContent && isStreaming) {
    return (
      <div className="text-muted-foreground text-sm">
        <Shimmer duration={1}>{t("chat.thinkingInProgress")}</Shimmer>
      </div>
    );
  }

  if (!hasVisibleContent) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("chat.thinkingPlaceholder")}
      </p>
    );
  }

  return (
    <div className="space-y-3 text-muted-foreground text-sm">
      {groupThinkingSegments(segments).map((group, index) => {
        if (group.kind === "tools") {
          return (
            <div
              className="flex flex-wrap gap-2"
              key={`tools:${group.invocations.map((invocation) => invocation.id).join(",")}`}
            >
              {group.invocations.map((invocation) => (
                <ToolInvocationChip
                  invocation={invocation}
                  key={invocation.id}
                />
              ))}
            </div>
          );
        }

        if (!group.text.trim()) {
          return null;
        }

        return (
          <StreamingPlainText
            key={`text:${index}`}
            text={group.text}
            className="text-muted-foreground"
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

