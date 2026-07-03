import {
  normalizeMessageProcessSteps,
  type MessageRecord,
} from "@/lib/db";

export function getAssistantAnswerText(message: MessageRecord): string {
  const persistedSteps = normalizeMessageProcessSteps(message.processSteps);

  for (let index = persistedSteps.length - 1; index >= 0; index -= 1) {
    const step = persistedSteps[index];
    if (step?.kind === "answer") {
      return step.text;
    }
  }

  return message.content || message.thinking || "";
}
