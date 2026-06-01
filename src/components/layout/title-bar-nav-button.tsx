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
};

export function TitleBarNavButton({ label, icon: Icon }: TitleBarNavButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={TITLE_BAR_NAV_BUTTON_CLASS}
          aria-label={label}
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
