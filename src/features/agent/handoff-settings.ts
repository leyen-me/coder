export const AGENT_HANDOFF_THRESHOLD_STORAGE_KEY =
  "coder.agentContextHandoffSettings";

export const DEFAULT_AGENT_HANDOFF_THRESHOLD = 0.8;
export const MIN_AGENT_HANDOFF_THRESHOLD = 0.5;
export const MAX_AGENT_HANDOFF_THRESHOLD = 0.95;

type AgentContextHandoffSettings = {
  triggerThreshold: number;
};

const DEFAULT_AGENT_CONTEXT_HANDOFF_SETTINGS: AgentContextHandoffSettings = {
  triggerThreshold: DEFAULT_AGENT_HANDOFF_THRESHOLD,
};

export function normalizeAgentHandoffThreshold(
  value: number | undefined,
  fallback = DEFAULT_AGENT_HANDOFF_THRESHOLD
): number {
  if (!Number.isFinite(value) || value === undefined) {
    return fallback;
  }

  return Math.min(
    Math.max(value, MIN_AGENT_HANDOFF_THRESHOLD),
    MAX_AGENT_HANDOFF_THRESHOLD
  );
}

export function readAgentContextHandoffSettings(): AgentContextHandoffSettings {
  if (typeof localStorage === "undefined") {
    return DEFAULT_AGENT_CONTEXT_HANDOFF_SETTINGS;
  }

  try {
    const raw = localStorage.getItem(AGENT_HANDOFF_THRESHOLD_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_AGENT_CONTEXT_HANDOFF_SETTINGS;
    }

    const parsed = JSON.parse(raw) as { triggerThreshold?: unknown };
    const triggerThreshold =
      typeof parsed.triggerThreshold === "number"
        ? parsed.triggerThreshold
        : undefined;

    return {
      triggerThreshold: normalizeAgentHandoffThreshold(triggerThreshold),
    };
  } catch {
    return DEFAULT_AGENT_CONTEXT_HANDOFF_SETTINGS;
  }
}

export function writeAgentContextHandoffSettings(
  settings: AgentContextHandoffSettings
): void {
  localStorage.setItem(
    AGENT_HANDOFF_THRESHOLD_STORAGE_KEY,
    JSON.stringify({
      triggerThreshold: normalizeAgentHandoffThreshold(
        settings.triggerThreshold
      ),
    })
  );
}

export function readAgentHandoffThreshold(): number {
  return readAgentContextHandoffSettings().triggerThreshold;
}

export function writeAgentHandoffThreshold(triggerThreshold: number): void {
  writeAgentContextHandoffSettings({ triggerThreshold });
}

export function formatAgentHandoffThresholdPercent(value: number): string {
  return String(Math.round(normalizeAgentHandoffThreshold(value) * 100));
}
