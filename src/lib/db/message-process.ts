import type { MessageProcessStep } from "./types";

export function normalizeMessageProcessSteps(
  steps: MessageProcessStep[] | undefined
): MessageProcessStep[] {
  return steps ?? [];
}
