import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentHeader,
  ContextTrigger,
} from "@/components/ai-elements/context";
import { composerFooterControlClassName } from "@/components/ai-elements/composer-footer-control";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

import type { SessionContextUsage } from "../lib/estimate-session-context-usage";

type ComposerContextUsageProps = {
  contextUsage: SessionContextUsage;
};

function formatTokenCount(tokens: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact" }).format(tokens);
}

type ContextTokenRowProps = {
  label: string;
  tokens: number | undefined;
};

function ContextTokenRow({ label, tokens }: ContextTokenRowProps) {
  if (!tokens) {
    return null;
  }

  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span>{formatTokenCount(tokens)}</span>
    </div>
  );
}

export function ComposerContextUsage({
  contextUsage,
}: ComposerContextUsageProps) {
  const { t } = useTranslation();
  const { maxTokens, usage, usedTokens } = contextUsage;

  if (usedTokens <= 0) {
    return null;
  }

  return (
    <Context maxTokens={maxTokens} usage={usage} usedTokens={usedTokens}>
      <ContextTrigger
        aria-label={t("chat.contextUsageTrigger")}
        className={cn(
          composerFooterControlClassName,
          "gap-1.5 px-2 hover:bg-accent hover:text-foreground"
        )}
        size="sm"
      />
      <ContextContent align="end" side="top">
        <ContextContentHeader />
        <ContextContentBody className="space-y-2">
          <ContextTokenRow label={t("chat.contextUsageInput")} tokens={usage.inputTokens} />
          <ContextTokenRow label={t("chat.contextUsageOutput")} tokens={usage.outputTokens} />
          <ContextTokenRow
            label={t("chat.contextUsageReasoning")}
            tokens={usage.reasoningTokens}
          />
          <ContextTokenRow label={t("chat.contextUsageCache")} tokens={usage.cachedInputTokens} />
        </ContextContentBody>
      </ContextContent>
    </Context>
  );
}
