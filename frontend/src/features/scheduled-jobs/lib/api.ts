import { apiPost } from "@/lib/api/client";

export type ScheduledJobAgentMode = "agent" | "ask";

export type ScheduledJobRunStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type ScheduledJobRunRecord = {
  id: string;
  taskId: string;
  sessionId: string;
  startedAt: number;
  completedAt: number | null;
  summary: string;
  status: ScheduledJobRunStatus;
};

export type ScheduledJobRecord = {
  id: string;
  name: string;
  description: string;
  cronExpression: string;
  prompt: string;
  workspaceDir: string | null;
  model: string;
  provider: string;
  agentMode: ScheduledJobAgentMode;
  thinkingEnabled: boolean;
  /** 每次运行时会话附带的 MCP 服务 id。 */
  attachedMcpServers?: string[];
  enabled: boolean;
  runs: ScheduledJobRunRecord[];
  createdAt: number;
  updatedAt: number;
};

export type CreateScheduledJobInput = {
  name: string;
  description: string;
  cronExpression: string;
  prompt: string;
  workspaceDir: string | null;
  model: string;
  provider?: string;
  agentMode: ScheduledJobAgentMode;
  thinkingEnabled: boolean;
  attachedMcpServers: string[];
};

export type UpdateScheduledJobInput = Partial<
  Omit<ScheduledJobRecord, "id" | "runs" | "createdAt" | "updatedAt">
>;

export async function listScheduledJobs(): Promise<ScheduledJobRecord[]> {
  const result = await apiPost<{ items: ScheduledJobRecord[] }>(
    "/api/scheduled-jobs/list"
  );
  return result.items ?? [];
}

export async function createScheduledJob(
  input: CreateScheduledJobInput
): Promise<ScheduledJobRecord> {
  return apiPost<ScheduledJobRecord>("/api/scheduled-jobs/create", input);
}

export async function updateScheduledJob(
  id: string,
  patch: UpdateScheduledJobInput
): Promise<ScheduledJobRecord> {
  return apiPost<ScheduledJobRecord>("/api/scheduled-jobs/update", { id, ...patch });
}

export async function deleteScheduledJob(id: string): Promise<void> {
  await apiPost("/api/scheduled-jobs/delete", { id });
}

export async function toggleScheduledJob(
  id: string,
  enabled: boolean
): Promise<ScheduledJobRecord> {
  return apiPost<ScheduledJobRecord>("/api/scheduled-jobs/toggle", { id, enabled });
}

export async function runScheduledJobNow(
  id: string
): Promise<"started" | "already_running"> {
  const result = await apiPost<{ status: string }>("/api/scheduled-jobs/run", { id });
  return result.status === "already_running" ? "already_running" : "started";
}

export async function listRunningScheduledJobIds(): Promise<string[]> {
  const result = await apiPost<{ ids: string[] }>("/api/scheduled-jobs/running");
  return result.ids ?? [];
}

export type ActiveScheduledRun = {
  jobId: string;
  sessionId: string;
  assistantMessageId: string;
  taskId: string;
};

export async function listActiveScheduledRuns(): Promise<ActiveScheduledRun[]> {
  const result = await apiPost<{ items: ActiveScheduledRun[] }>(
    "/api/scheduled-jobs/active-runs"
  );
  return result.items ?? [];
}

export async function cancelScheduledJobRun(input: {
  taskId?: string;
  sessionId?: string;
  jobId?: string;
}): Promise<{ cancelled: boolean }> {
  const result = await apiPost<{ ok: boolean; cancelled: boolean }>(
    "/api/scheduled-jobs/cancel",
    {
      taskId: input.taskId,
      sessionId: input.sessionId,
      jobId: input.jobId,
    }
  );
  return { cancelled: result.cancelled ?? false };
}
