import { getKVStore } from "@/lib/storage";

export const AGENT_SESSION_THRESHOLD_STORAGE_KEY =
  "coder:agent-context-session-settings";

export const DEFAULT_AGENT_SESSION_THRESHOLD = 0.8;
export const MIN_AGENT_SESSION_THRESHOLD = 0.5;
export const MAX_AGENT_SESSION_THRESHOLD = 0.95;

type AgentSessionSettings = {
  triggerThreshold: number;
};

const DEFAULT_AGENT_SESSION_SETTINGS: AgentSessionSettings = {
  triggerThreshold: DEFAULT_AGENT_SESSION_THRESHOLD,
};

export function normalizeSessionThreshold(
  value: number | undefined,
  fallback = DEFAULT_AGENT_SESSION_THRESHOLD
): number {
  if (!Number.isFinite(value) || value === undefined) {
    return fallback;
  }

  return Math.min(
    Math.max(value, MIN_AGENT_SESSION_THRESHOLD),
    MAX_AGENT_SESSION_THRESHOLD
  );
}

export function readAgentSessionSettings(): AgentSessionSettings {
  try {
    const raw = getKVStore().getItem(AGENT_SESSION_THRESHOLD_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_AGENT_SESSION_SETTINGS;
    }

    const parsed = JSON.parse(raw) as { triggerThreshold?: unknown };
    const triggerThreshold =
      typeof parsed.triggerThreshold === "number"
        ? parsed.triggerThreshold
        : undefined;

    return {
      triggerThreshold: normalizeSessionThreshold(triggerThreshold),
    };
  } catch {
    return DEFAULT_AGENT_SESSION_SETTINGS;
  }
}

export function writeAgentSessionSettings(
  settings: AgentSessionSettings
): void {
  getKVStore().setItem(
    AGENT_SESSION_THRESHOLD_STORAGE_KEY,
    JSON.stringify({
      triggerThreshold: normalizeSessionThreshold(
        settings.triggerThreshold
      ),
    })
  );
}

export function readAgentSessionThreshold(): number {
  return readAgentSessionSettings().triggerThreshold;
}

export function writeAgentSessionThreshold(triggerThreshold: number): void {
  writeAgentSessionSettings({ triggerThreshold });
}

export function formatSessionThresholdPercent(value: number): string {
  return String(Math.round(normalizeSessionThreshold(value) * 100));
}
