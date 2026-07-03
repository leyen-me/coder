import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { TITLE_BAR_NAV_BUTTON_CLASS } from "./constants";

type TitleBarNavButtonProps = {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  isActive?: boolean;
  disabled?: boolean;
};

export function TitleBarNavButton({
  label,
  icon: Icon,
  onClick,
  isActive,
  disabled,
}: TitleBarNavButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={TITLE_BAR_NAV_BUTTON_CLASS}
          aria-label={label}
          aria-pressed={isActive}
          disabled={disabled}
          onClick={onClick}
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
