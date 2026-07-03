"use client";

import {
  Reasoning,
  ReasoningTrigger,
  useReasoning,
} from "@/components/ai-elements/reasoning";
import { CollapsibleContent } from "@/components/ui/collapsible";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, ScrollTextIcon } from "lucide-react";

type SystemPromptBlockProps = {
  content: string;
  onExpand?: () => void;
};

export function SystemPromptBlock({ content, onExpand }: SystemPromptBlockProps) {
  return (
    <Reasoning
      className="mb-0 w-full"
      defaultOpen={false}
      isStreaming={false}
      onOpenChange={(open) => {
        if (open) {
          onExpand?.();
        }
      }}
    >
      <SystemPromptTrigger />
      <CollapsibleContent
        className={cn(
          "mt-4 text-sm",
          "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-muted-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in"
        )}
      >
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
          {content}
        </pre>
      </CollapsibleContent>
    </Reasoning>
  );
}

function SystemPromptTrigger() {
  const { t } = useTranslation();
  const { isOpen } = useReasoning();

  return (
    <ReasoningTrigger>
      <ScrollTextIcon className="size-4" />
      <p>{t("chat.systemPrompt")}</p>
      <ChevronDownIcon
        className={cn(
          "size-4 transition-transform",
          isOpen ? "rotate-180" : "rotate-0"
        )}
      />
    </ReasoningTrigger>
  );
}
