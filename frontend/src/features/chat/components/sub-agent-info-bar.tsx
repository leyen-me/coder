import { Pause } from "lucide-react";

import type { AgentMode } from "@/features/agent/types";
import type { SessionAutonomyMode, SessionKind } from "@/lib/db";
import type { SessionContextUsage } from "../lib/estimate-session-context-usage";
import { cn } from "@/lib/utils";

type SubAgentInfoBarProps = {
  model: string;
  agentMode: AgentMode;
  thinkingEnabled: boolean;
  sessionKind?: SessionKind;
  autonomyMode?: SessionAutonomyMode;
  contextUsage: SessionContextUsage | null;
  isRunning: boolean;
  onStop?: () => void;
};

const AGENT_MODE_LABEL: Record<AgentMode, string> = {
  agent: "智能体",
  ask: "问答",
  plan: "计划",
};

function InfoChip({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active?: boolean;
}) {
  return (
    <div className="flex min-w-[64px] flex-col gap-0.5 rounded-md border border-border bg-muted/40 px-2 py-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "truncate text-xs font-medium",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Read-only replacement for the composer at the bottom of a SubAgent panel.
 * It only surfaces live info about the child session — no text input, so the
 * user cannot send a new prompt. A pause/stop button is offered while the
 * child is running.
 */
export function SubAgentInfoBar({
  model,
  agentMode,
  thinkingEnabled,
  sessionKind,
  autonomyMode,
  contextUsage,
  isRunning,
  onStop,
}: SubAgentInfoBarProps) {
  const percent =
    contextUsage && contextUsage.maxTokens > 0
      ? Math.min(
          100,
          Math.round((contextUsage.usedTokens / contextUsage.maxTokens) * 100),
        )
      : null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
      <InfoChip label="模式" value={AGENT_MODE_LABEL[agentMode] ?? agentMode} />
      <InfoChip label="模型" value={model} />
      <InfoChip
        label="深度思考"
        value={thinkingEnabled ? "开启" : "关闭"}
        active={thinkingEnabled}
      />
      <InfoChip
        label="长任务"
        value={sessionKind === "long_task" ? "是" : "否"}
        active={sessionKind === "long_task"}
      />
      {autonomyMode === "unattended" ? (
        <InfoChip label="自治" value="自主" active />
      ) : null}
      <div className="flex min-w-[96px] flex-1 flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            上下文进度
          </span>
          {percent != null && (
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {percent}%
            </span>
          )}
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${percent ?? 0}%` }}
          />
        </div>
      </div>
      {isRunning && onStop ? (
        <button
          type="button"
          onClick={onStop}
          title="停止子 agent 运行"
          className="flex shrink-0 items-center gap-1 rounded-md bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20"
        >
          <Pause className="h-3.5 w-3.5" />
          暂停
        </button>
      ) : (
        <span className="shrink-0 rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground">
          {isRunning ? "运行中" : "已结束"}
        </span>
      )}
    </div>
  );
}
