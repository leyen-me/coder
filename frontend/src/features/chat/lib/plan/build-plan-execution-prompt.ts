import { extractPlanBodyForExecution } from "./extract-plan-body";

/**
 * Builds the user message sent when executing a reviewed plan in Agent mode.
 */
export function buildPlanExecutionPrompt(
  planContent: string,
  planPath?: string | null
): string {
  const trimmed = extractPlanBodyForExecution(planContent);
  if (!trimmed) {
    throw new Error("Plan content is empty");
  }

  const planHeading = planPath?.trim()
    ? `## Plan (${planPath.trim()})`
    : "## Plan (.coder/plan/)";

  return [
    "Please implement the following plan. Follow it step by step.",
    "Do not re-plan unless you are blocked and need to clarify assumptions.",
    "",
    planHeading,
    "",
    trimmed,
  ].join("\n");
}
