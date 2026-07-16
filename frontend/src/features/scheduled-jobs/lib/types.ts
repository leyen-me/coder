import type { ScheduledJobRecord } from "./api";

export type ScheduledJobViewModel = ScheduledJobRecord & {
  running: boolean;
};

export type { ScheduledJobRunRecord } from "./api";
export type {
  CreateScheduledJobInput,
  UpdateScheduledJobInput,
  ScheduledJobAgentMode,
  ScheduledJobRunStatus,
} from "./api";
