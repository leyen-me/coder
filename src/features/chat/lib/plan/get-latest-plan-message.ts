import type { MessageRecord } from "@/lib/db";

function extractPlanContent(message: MessageRecord): string {
  const directContent = message.content.trim();
  if (directContent) {
    return directContent;
  }

  const steps = message.processSteps ?? [];
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step?.kind === "answer" && step.text.trim()) {
      return step.text.trim();
    }
  }

  return "";
}

/**
 * Returns the latest completed plan artifact message in a session, if any.
 */
export function getLatestPlanMessage(
  messages: readonly MessageRecord[]
): MessageRecord | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message?.role !== "assistant" ||
      message.messageKind !== "plan" ||
      message.status !== "completed"
    ) {
      continue;
    }

    const content = extractPlanContent(message);
    if (!content) {
      continue;
    }

    return content === message.content ? message : { ...message, content };
  }

  return null;
}

export function getLatestPlanContent(
  messages: readonly MessageRecord[]
): string | null {
  return getLatestPlanMessage(messages)?.content.trim() ?? null;
}

export function canBuildFromPlan(
  messages: readonly MessageRecord[],
  isRunning: boolean
): boolean {
  return !isRunning && getLatestPlanMessage(messages) !== null;
}
