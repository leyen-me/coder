import { apiPost } from "@/lib/api/client";

type AgentDiagnosticLogInput = {
  category: string;
  sessionId?: string | null;
  taskId?: string | null;
  payload: unknown;
};

export async function writeAgentDiagnosticLog(
  input: AgentDiagnosticLogInput
): Promise<void> {
  const category = input.category.trim();
  if (!category) {
    return;
  }

  await apiPost("/api/agent_diagnostic_log", {
    category,
    sessionId: input.sessionId ?? null,
    taskId: input.taskId ?? null,
    payload: input.payload,
  });
}
