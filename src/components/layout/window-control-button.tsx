import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import {
  TITLE_BAR_HEIGHT_CLASS,
  WINDOW_CONTROL_BUTTON_WIDTH_CLASS,
} from "./constants";

const baseClassName = [
  "inline-flex items-center justify-center border-0 bg-transparent p-0",
  "text-muted-foreground outline-none transition-colors",
  "hover:text-foreground focus-visible:outline-none",
  "hover:bg-foreground/5 dark:hover:bg-foreground/10",
  TITLE_BAR_HEIGHT_CLASS,
  WINDOW_CONTROL_BUTTON_WIDTH_CLASS,
  "shrink-0",
].join(" ");

type WindowControlButtonProps = {
  label: string;
  onClick: () => void;
  variant?: "default" | "close";
  children: ReactNode;
};

export function WindowControlButton({
  label,
  onClick,
  variant = "default",
  children,
}: WindowControlButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        baseClassName,
        variant === "close" &&
          "hover:bg-window-close-hover hover:text-white dark:hover:bg-window-close-hover dark:hover:text-white",
      )}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
