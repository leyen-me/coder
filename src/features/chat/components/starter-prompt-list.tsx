import { GitBranch, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

type StarterPromptListProps = {
  onSelect: (prompt: string) => void;
  className?: string;
};

export function StarterPromptList({ onSelect, className }: StarterPromptListProps) {
  const { messages } = useLocale();

  return (
    <ul className={cn("flex w-full max-w-3xl flex-col gap-0.5", className)}>
      {messages.starterPrompts.map((item, index) => {
        const Icon = index === 0 ? Sparkles : GitBranch;

        return (
          <li key={item.id}>
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full justify-start gap-2.5 rounded-xl px-2 py-2.5 text-left font-normal text-muted-foreground hover:text-foreground"
              onClick={() => onSelect(item.prompt)}
            >
              <Icon className="size-4 shrink-0 opacity-60" />
              <span className="text-sm">{item.label}</span>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
