import type { LabSettings } from "./types";

export const LAB_STORAGE_KEY = "coder:lab:settings";

export const DEFAULT_LAB_SETTINGS: LabSettings = {
  longTaskEnabled: false,
  virtualScrollEnabled: false,
};
