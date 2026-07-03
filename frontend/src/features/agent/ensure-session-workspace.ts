import { readWorkspaceDir } from "@/features/workspace/storage";
import { getSession, updateSession, type SessionRecord } from "@/lib/db";

export async function ensureSessionWorkspaceForAgent(
  sessionId: string
): Promise<SessionRecord> {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  if (session.workspaceDir?.trim()) {
    return session;
  }

  const fallback = readWorkspaceDir();
  if (!fallback?.trim()) {
    return session;
  }

  const updated = await updateSession(sessionId, {
    workspaceDir: fallback,
  });

  return updated ?? session;
}
