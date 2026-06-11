/**
 * Builds the user message sent when executing a reviewed plan in Agent mode.
 */
export function buildPlanExecutionPrompt(planContent: string): string {
  const trimmed = planContent.trim();
  if (!trimmed) {
    throw new Error("Plan content is empty");
  }

  return [
    "Please implement the following plan. Follow it step by step.",
    "Do not re-plan unless you are blocked and need to clarify assumptions.",
    "",
    "## Plan (plan.md)",
    "",
    trimmed,
  ].join("\n");
}
