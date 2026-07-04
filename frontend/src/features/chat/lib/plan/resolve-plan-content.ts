import {
  getLatestWorkspacePlan,
  readWorkspacePlan,
} from "@/features/plan/plan-service";

export type ResolvedPlanForBuild = {
  content: string;
  path: string | null;
};

/**
 * Resolves plan content for execution, preferring the session-bound plan file,
 * then the latest .plan/ file, then inline message content.
 */
export async function resolvePlanContentForBuild(
  workspaceDir: string | null | undefined,
  messageContent: string,
  planFileName?: string | null
): Promise<ResolvedPlanForBuild> {
  if (workspaceDir?.trim()) {
    const trimmedWorkspace = workspaceDir.trim();
    try {
      if (planFileName?.trim()) {
        const boundPlan = await readWorkspacePlan(
          trimmedWorkspace,
          planFileName.trim()
        );
        if (boundPlan.content.trim()) {
          return {
            content: boundPlan.content,
            path: boundPlan.path ?? null,
          };
        }
      }

      const latest = await getLatestWorkspacePlan(trimmedWorkspace);
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
