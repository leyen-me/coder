import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type SettingSelectOption<T extends string> = {
  value: T;
  label: string;
};

type SettingSelectProps<T extends string> = {
  value: T;
  options: readonly SettingSelectOption<T>[];
  onValueChange: (value: T) => void;
  "aria-label": string;
  className?: string;
};

export function SettingSelect<T extends string>({
  value,
  options,
  onValueChange,
  "aria-label": ariaLabel,
  className,
}: SettingSelectProps<T>) {
  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? value;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("min-w-32 justify-between font-normal", className)}
          aria-label={ariaLabel}
        >
          <span>{selectedLabel}</span>
          <ChevronDown className="size-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-32">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(nextValue) => onValueChange(nextValue as T)}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
