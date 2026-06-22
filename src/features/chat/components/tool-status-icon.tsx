"use client";

import type { ToolUIPart } from "ai";
import {
  CheckCircle2Icon,
  CircleIcon,
  LoaderCircleIcon,
  XCircleIcon,
} from "lucide-react";

type ToolStatusIconProps = {
  state: ToolUIPart["state"];
  /**
   * Optional shell-level status override.
   * When "running", shows a blue spinning icon instead of the generic
   * streaming indicator. Used by ShellOutput.
   */
  status?: string;
};

export function ToolStatusIcon({ state, status }: ToolStatusIconProps) {
  // Running status overrides the generic streaming icon
  if (status === "running") {
    return (
      <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin text-blue-600" />
    );
  }

  switch (state) {
    case "output-available":
      return (
        <CheckCircle2Icon className="size-3.5 shrink-0 text-green-600" />
      );
    case "output-error":
      return <XCircleIcon className="size-3.5 shrink-0 text-destructive" />;
    case "input-streaming":
    case "input-available":
      return (
        <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      );
    default:
      return <CircleIcon className="size-3.5 shrink-0 text-muted-foreground" />;
  }
}
