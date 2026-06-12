import { getLatestWorkspacePlan } from "@/features/plan/plan-service";

export type ResolvedPlanForBuild = {
  content: string;
  path: string | null;
};

/**
 * Resolves plan content for execution, preferring the latest .plan/ file
 * over inline message content.
 */
export async function resolvePlanContentForBuild(
  workspaceDir: string | null | undefined,
  messageContent: string
): Promise<ResolvedPlanForBuild> {
  if (workspaceDir?.trim()) {
    try {
      const latest = await getLatestWorkspacePlan(workspaceDir.trim());
      if (latest?.content?.trim()) {
        return {
          content: latest.content,
          path: latest.path ?? null,
        };
      }
    } catch {
      // Fall back to message content when plan files cannot be read.
    }
  }

  return {
    content: messageContent,
    path: null,
  };
}
