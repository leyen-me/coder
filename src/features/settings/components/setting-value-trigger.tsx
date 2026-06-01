import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";

type SettingValueTriggerProps = {
  value: string;
  "aria-label": string;
};

/** Placeholder control for settings that will gain real selection logic later. */
export function SettingValueTrigger({
  value,
  "aria-label": ariaLabel,
}: SettingValueTriggerProps) {
  return (
    <Button
      type="button"
      variant="outline"
      className="min-w-32 justify-between font-normal"
      aria-label={ariaLabel}
      aria-readonly="true"
    >
      <span>{value}</span>
      <ChevronDown className="size-4 opacity-50" />
    </Button>
  );
}
