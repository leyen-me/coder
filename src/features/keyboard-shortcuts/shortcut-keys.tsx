import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { formatBindingParts } from "@/lib/keyboard-shortcuts/format";
import { cn } from "@/lib/utils";

type ShortcutKeysProps = {
  binding: string;
  className?: string;
};

export function ShortcutKeys({ binding, className }: ShortcutKeysProps) {
  const parts = formatBindingParts(binding);

  if (parts.length === 0) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        —
      </span>
    );
  }

  return (
    <KbdGroup className={className}>
      {parts.map((part, index) => (
        <Kbd key={`${part}-${index}`}>{part}</Kbd>
      ))}
    </KbdGroup>
  );
}
