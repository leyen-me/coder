import { toast } from "sonner";

import { isSkillReferenceValidationError } from "@/features/skills/lib/skill-errors";

import { PromptSendCancelledError } from "./prompt-send-errors";

export function notifySendMessageError(
  error: unknown,
  t: (key: "skillNotEnabled" | "skillNotFound", params?: { slug: string }) => string
): void {
  if (error instanceof PromptSendCancelledError) {
    return;
  }
  if (isSkillReferenceValidationError(error)) {
    toast.error(
      t(
        error.code === "not_enabled"
          ? "skillNotEnabled"
          : "skillNotFound",
        { slug: error.slug }
      )
    );
    return;
  }

  if (error instanceof Error && error.message) {
    toast.error(error.message);
  }
}
