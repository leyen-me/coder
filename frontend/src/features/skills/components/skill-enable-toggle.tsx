import { Check, Circle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SkillEnableToggleProps = {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  label: string;
};

export function SkillEnableToggle({
  enabled,
  onToggle,
  label,
}: SkillEnableToggleProps) {
  return (
    <Button
      aria-label={label}
      aria-pressed={enabled}
      className={cn(
        "size-8 shrink-0 rounded-full p-0",
        enabled
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "bg-muted text-muted-foreground hover:bg-muted/80"
      )}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(!enabled);
      }}
      type="button"
      variant="ghost"
    >
      {enabled ? (
        <Check className="size-4" strokeWidth={2.5} />
      ) : (
        <Circle className="size-4" strokeWidth={2} />
      )}
    </Button>
  );
}
