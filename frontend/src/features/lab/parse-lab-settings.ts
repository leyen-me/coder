import { DEFAULT_LAB_SETTINGS } from "./constants";
import type { LabSettings } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseLabSettings(value: unknown): LabSettings {
  if (!isRecord(value)) {
    return DEFAULT_LAB_SETTINGS;
  }

  const longTaskEnabled =
    typeof value.longTaskEnabled === "boolean"
      ? value.longTaskEnabled
      : DEFAULT_LAB_SETTINGS.longTaskEnabled;

  const virtualScrollEnabled =
    typeof value.virtualScrollEnabled === "boolean"
      ? value.virtualScrollEnabled
      : DEFAULT_LAB_SETTINGS.virtualScrollEnabled;

  return {
    longTaskEnabled,
    virtualScrollEnabled,
  };
}
