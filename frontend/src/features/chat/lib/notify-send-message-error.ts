import { toast } from "sonner";

import { isSkillReferenceValidationError } from "@/features/skills/lib/skill-errors";

export function notifySendMessageError(
  error: unknown,
  t: (key: "skillNotFound", params?: { slug: string }) => string
): void {
  if (isSkillReferenceValidationError(error)) {
    toast.error(t("skillNotFound", { slug: error.slug }));
    return;
  }

  if (error instanceof Error && error.message) {
    toast.error(error.message);
  }
}
