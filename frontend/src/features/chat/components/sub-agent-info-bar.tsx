import type { ReactNode } from "react";
import {
  BotIcon,
  BrainIcon,
  ClipboardListIcon,
  FileQuestionIcon,
  SquareIcon,
  ZapIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  composerFooterControlActiveClassName,
} from "@/components/ai-elements/composer-footer-control";
import { ComposerContextUsage } from "./composer-context-usage";
import type { AgentMode } from "@/features/agent/types";
import {
  findModelDefinition,
  getModelDisplayName,
  type ModelDefinition,
} from "@/lib/model-provider/model-definition";
import type { SessionAutonomyMode, SessionKind } from "@/lib/db";
import type { SessionContextUsage } from "../lib/estimate-session-context-usage";
import { cn } from "@/lib/utils";

type SubAgentInfoBarProps = {
  model: string;
  models?: readonly ModelDefinition[];
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

function resolveAgentModeIcon(agentMode: AgentMode) {
  if (agentMode === "agent") {
    return BotIcon;
  }
  if (agentMode === "plan") {
    return ClipboardListIcon;
  }
  return FileQuestionIcon;
}

function resolveModelLabel(
  model: string,
  models?: readonly ModelDefinition[],
): string {
  if (!models) {
    return model;
  }
  const definition = findModelDefinition(models, model);
  return definition ? getModelDisplayName(definition) : model;
}

/**
 * Read-only pill that mirrors the shape/color of `ComposerFooterControls`
 * (rounded-xl, muted-foreground text, accent fill when active) but without the
 * interactive hover, so it does not look clickable.
 */
const READONLY_PILL_CLASS =
  "inline-flex h-8 min-h-8 shrink-0 items-center gap-1.5 rounded-xl border-none bg-transparent px-2.5 py-0 text-sm font-medium shadow-none transition-colors";

function ReadonlyPill({
  icon: Icon,
  active,
  children,
}: {
  icon?: typeof BotIcon;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        READONLY_PILL_CLASS,
        active
          ? composerFooterControlActiveClassName
          : "text-muted-foreground",
      )}
      data-state={active ? "on" : "off"}
    >
      {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * Read-only replacement for the composer at the bottom of a SubAgent panel.
 * It only surfaces live info about the child session — no text input, so the
 * user cannot send a new prompt. A pause/stop button is offered while the
 * child is running. The visual language matches the parent composer footer.
 */
export function SubAgentInfoBar({
  model,
  models,
  agentMode,
  thinkingEnabled,
  sessionKind,
  autonomyMode,
  contextUsage,
  isRunning,
  onStop,
}: SubAgentInfoBarProps) {
  const ModeIcon = resolveAgentModeIcon(agentMode);
  const modelLabel = resolveModelLabel(model, models);

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        <ReadonlyPill icon={ModeIcon}>{AGENT_MODE_LABEL[agentMode] ?? agentMode}</ReadonlyPill>
        {sessionKind === "long_task" ? (
          <ReadonlyPill icon={ClipboardListIcon} active>
            长任务
          </ReadonlyPill>
        ) : null}
        <ReadonlyPill>{modelLabel}</ReadonlyPill>
        <ReadonlyPill icon={BrainIcon} active={thinkingEnabled}>
          深度思考
        </ReadonlyPill>
        {autonomyMode === "unattended" ? (
          <ReadonlyPill icon={ZapIcon} active>
            自主
          </ReadonlyPill>
        ) : null}
        {contextUsage ? <ComposerContextUsage contextUsage={contextUsage} /> : null}
      </div>
      {isRunning && onStop ? (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={onStop}
          className="shrink-0"
        >
          <SquareIcon className="size-4" />
          暂停
        </Button>
      ) : (
        <span className="shrink-0 rounded-xl px-2.5 py-0 text-sm font-medium text-muted-foreground">
          {isRunning ? "运行中" : "已结束"}
        </span>
      )}
    </div>
  );
}
