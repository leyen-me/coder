import { getDb } from "./client";
import { MESSAGES_STORE, SESSIONS_STORE } from "./constants";
import type { MessageRecord } from "./types";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type StatsChange = {
  /** Percentage change vs previous period. Positive = up, negative = down. */
  sessionCount: number;
  messageCount: number;
  agentRunCount: number;
  totalTokens: number;
};

export type PlatformStats = {
  sessionCount: number;
  messageCount: number;
  agentRunCount: number;
  totalTokens: number;
  /** Period-over-period change percentages. */
  change: StatsChange;
};

export type TodayStats = {
  todayMessages: number;
  weekMessages: number;
  todayTokens: number;
  todaySessions: number;
  topModel: string;
  avgDuration: number;
};

export type MessageTrendItem = {
  date: string;
  userCount: number;
  assistantCount: number;
};

export type ModelDistributionItem = {
  model: string;
  count: number;
  percentage: number;
};

export type ToolUsageItem = {
  name: string;
  count: number;
};

export type DurationBucketItem = {
  bucket: string;
  count: number;
};

export type TokenUsageByDateItem = {
  date: string;
  totalTokens: number;
  completionTokens: number;
};

export type ActiveSessionItem = {
  title: string;
  messageCount: number;
  totalTokens: number;
  updatedAt: number;
};

export type SessionTypeCount = {
  sessionKind: string;
  count: number;
};

export type AutonomyModeCount = {
  autonomyMode: string;
  count: number;
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isToday(ts: number): boolean {
  const now = new Date();
  const d = new Date(ts);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function daysAgo(ts: number, days: number): boolean {
  const cutoff = Date.now() - days * 86_400_000;
  return ts >= cutoff;
}

/* -------------------------------------------------------------------------- */
/*  Queries                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Compute aggregate stats for messages falling within a given time window.
 */
function computeWindowStats(
  messages: MessageRecord[],
  startTs: number,
  endTs: number,
): { sessionCount: number; messageCount: number; agentRunCount: number; totalTokens: number } {
  const sessionSet = new Set<string>();
  let messageCount = 0;
  let totalTokens = 0;

  for (const m of messages) {
    if (m.createdAt < startTs || m.createdAt >= endTs) continue;
    messageCount++;
    sessionSet.add(m.sessionId);
    totalTokens += m.usage?.completionTokens ?? 0;
  }

  const agentRunCount = new Set(
    messages.filter(
      (m) => m.role === "assistant" && m.createdAt >= startTs && m.createdAt < endTs,
    ).map((m) => m.sessionId),
  ).size;

  return { sessionCount: sessionSet.size, messageCount, agentRunCount, totalTokens };
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Overview cards: total sessions, messages, agent runs, and tokens + period-over-period change. */
export async function getPlatformStats(): Promise<PlatformStats> {
  const db = await getDb();
  const [sessions, messages] = await Promise.all([
    db.getAll(SESSIONS_STORE),
    db.getAll(MESSAGES_STORE),
  ]);

  const agentMessages = messages.filter((m) => m.role === "assistant");
  const agentRunCount = new Set(agentMessages.map((m) => m.sessionId)).size;

  // Use completionTokens rather than totalTokens to avoid the inflated
  // double-counting caused by overlapping prompt history across messages
  // in the same session (totalTokens = prompt + completion, and prompt
  // includes accumulated history on every request).
  const totalTokens = messages.reduce((sum, m) => {
    return sum + (m.usage?.completionTokens ?? 0);
  }, 0);

  // Period-over-period: compare last 30 days vs the 30 days before that.
  const now = Date.now();
  const periodLen = 30 * 86_400_000;
  const currentStart = now - periodLen;
  const previousStart = now - 2 * periodLen;

  const current = computeWindowStats(messages, currentStart, now);
  const previous = computeWindowStats(messages, previousStart, currentStart);

  return {
    sessionCount: sessions.length,
    messageCount: messages.length,
    agentRunCount,
    totalTokens,
    change: {
      sessionCount: pctChange(current.sessionCount, previous.sessionCount),
      messageCount: pctChange(current.messageCount, previous.messageCount),
      agentRunCount: pctChange(current.agentRunCount, previous.agentRunCount),
      totalTokens: pctChange(current.totalTokens, previous.totalTokens),
    },
  };
}

/** Today / this week activity row. */
export async function getTodayStats(): Promise<TodayStats> {
  const db = await getDb();
  const messages = await db.getAll(MESSAGES_STORE);

  let todayMessages = 0;
  let weekMessages = 0;
  let todayTokens = 0;
  const todaySessionSet = new Set<string>();
  const modelCounts = new Map<string, number>();
  let totalDuration = 0;
  let durationCount = 0;

  for (const m of messages) {
    if (isToday(m.createdAt)) {
      todayMessages++;
      todayTokens += m.usage?.completionTokens ?? 0;
      todaySessionSet.add(m.sessionId);
    }
    if (daysAgo(m.createdAt, 7)) {
      weekMessages++;
    }
    if (m.role === "assistant") {
      if (m.durationMs !== undefined && m.durationMs !== null) {
        totalDuration += m.durationMs;
        durationCount++;
      }
    }
  }

  // Session model counts
  const sessions = await db.getAll(SESSIONS_STORE);
  for (const s of sessions) {
    const model = s.model || "unknown";
    modelCounts.set(model, (modelCounts.get(model) ?? 0) + 1);
  }

  const topModel =
    [...modelCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  const avgDuration =
    durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;

  return {
    todayMessages,
    weekMessages,
    todayTokens,
    todaySessions: todaySessionSet.size,
    topModel,
    avgDuration,
  };
}

/** Daily message counts for a line chart. */
export async function getMessageTrend(days: number): Promise<MessageTrendItem[]> {
  const db = await getDb();
  const messages = await db.getAll(MESSAGES_STORE);
  const cutoff = Date.now() - days * 86_400_000;
  const filtered = messages.filter((m) => m.createdAt >= cutoff);

  const map = new Map<string, { userCount: number; assistantCount: number }>();
  for (const m of filtered) {
    const key = formatDate(m.createdAt);
    const entry = map.get(key) ?? { userCount: 0, assistantCount: 0 };
    if (m.role === "user") entry.userCount++;
    else entry.assistantCount++;
    map.set(key, entry);
  }

  return [...map.entries()]
    .map(([date, counts]) => ({ date, ...counts }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Model usage distribution for a pie chart. */
export async function getModelDistribution(): Promise<ModelDistributionItem[]> {
  const db = await getDb();
  const sessions = await db.getAll(SESSIONS_STORE);
  const counts = new Map<string, number>();
  for (const s of sessions) {
    const model = s.model || "unknown";
    counts.set(model, (counts.get(model) ?? 0) + 1);
  }
  const total = sessions.length || 1;
  return [...counts.entries()]
    .map(([model, count]) => ({ model, count, percentage: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
}

/** Session type & autonomy mode distribution. */
export async function getSessionTypeDistribution(): Promise<{
  sessionKind: SessionTypeCount[];
  autonomyMode: AutonomyModeCount[];
}> {
  const db = await getDb();
  const sessions = await db.getAll(SESSIONS_STORE);

  const kindMap = new Map<string, number>();
  const modeMap = new Map<string, number>();

  for (const s of sessions) {
    const kind = s.sessionKind || "standard";
    kindMap.set(kind, (kindMap.get(kind) ?? 0) + 1);

    const mode = s.autonomyMode || "interactive";
    modeMap.set(mode, (modeMap.get(mode) ?? 0) + 1);
  }

  return {
    sessionKind: [...kindMap.entries()]
      .map(([sessionKind, count]) => ({ sessionKind, count }))
      .sort((a, b) => b.count - a.count),
    autonomyMode: [...modeMap.entries()]
      .map(([autonomyMode, count]) => ({ autonomyMode, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/** Top-N most frequently used tool names. */
export async function getToolUsageRanking(limit = 10): Promise<ToolUsageItem[]> {
  const db = await getDb();
  const messages = await db.getAll(MESSAGES_STORE);
  const counts = new Map<string, number>();

  for (const m of messages) {
    if (m.toolInvocations) {
      for (const t of m.toolInvocations) {
        counts.set(t.name, (counts.get(t.name) ?? 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Duration bucketed for a histogram. */
export async function getAgentDurationDistribution(): Promise<DurationBucketItem[]> {
  const db = await getDb();
  const messages = await db.getAll(MESSAGES_STORE);
  const buckets: Record<string, number> = {
    "<5s": 0,
    "5-15s": 0,
    "15-30s": 0,
    "30s+": 0,
  };

  for (const m of messages) {
    if (m.role !== "assistant" || m.durationMs === undefined || m.durationMs === null) continue;
    const sec = m.durationMs / 1000;
    if (sec < 5) buckets["<5s"]++;
    else if (sec < 15) buckets["5-15s"]++;
    else if (sec < 30) buckets["15-30s"]++;
    else buckets["30s+"]++;
  }

  return Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));
}

/**
 * Daily aggregated token usage for the heatmap.
 *
 * We aggregate completionTokens instead of totalTokens because totalTokens
 * (sum of prompt + completion) includes overlapping history context across
 * messages in the same session. Completion tokens represent actual model
 * output and are not subject to this double-counting.
 */
export async function getTokenUsageByDate(days: number): Promise<TokenUsageByDateItem[]> {
  const db = await getDb();
  const messages = await db.getAll(MESSAGES_STORE);
  const cutoff = Date.now() - days * 86_400_000;
  const filtered = messages.filter((m) => m.createdAt >= cutoff);

  const totalMap = new Map<string, number>();
  const completionMap = new Map<string, number>();
  for (const m of filtered) {
    const key = formatDate(m.createdAt);
    totalMap.set(key, (totalMap.get(key) ?? 0) + (m.usage?.totalTokens ?? 0));
    completionMap.set(key, (completionMap.get(key) ?? 0) + (m.usage?.completionTokens ?? 0));
  }

  return [...totalMap.entries()]
    .map(([date, totalTokens]) => ({
      date,
      totalTokens,
      completionTokens: completionMap.get(date) ?? 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Recently updated sessions with message & token counts. */
export async function getActiveSessions(limit = 10): Promise<ActiveSessionItem[]> {
  const db = await getDb();
  const sessions = await db.getAllFromIndex(SESSIONS_STORE, "by-updatedAt");
  const messages = await db.getAll(MESSAGES_STORE);

  // Group messages by session
  const msgMap = new Map<string, MessageRecord[]>();
  for (const m of messages) {
    const list = msgMap.get(m.sessionId) ?? [];
    list.push(m);
    msgMap.set(m.sessionId, list);
  }

  return sessions
    .reverse()
    .slice(0, limit)
    .map((s) => {
      const msgs = msgMap.get(s.id) ?? [];
      const totalTokens = msgs.reduce((sum, m) => sum + (m.usage?.completionTokens ?? 0), 0);
      return {
        title: s.title || "Untitled",
        messageCount: msgs.length,
        totalTokens,
        updatedAt: s.updatedAt,
      };
    });
}
