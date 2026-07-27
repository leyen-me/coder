import { useNavigate } from "react-router-dom";
import { Check, Loader2, X } from "lucide-react";

import { paths } from "@/app/paths";
import { cn } from "@/lib/utils";

interface SubAgentLabelProps {
  output: unknown;
  input: unknown;
  errorText?: string | null;
}

/** ToolResultEnvelope shape: {ok, tool, data: {...}, error?} */
interface ToolResultEnvelopeShape {
  ok?: boolean;
  tool?: string;
  data?: unknown;
}

interface SubAgentDataShape {
  sessionId?: string;
  status?: string;
  handleId?: string;
  /** Legacy pre-refactor field — used to detect old data for degraded render. */
  __progress?: unknown;
}

interface SubAgentInputShape {
  task?: string;
}

/**
 * Extract the SubAgent data object from the tool output.
 *
 * `spawn_subagent` returns `ToolResultEnvelope { ok, tool, data: {sessionId, status} }`.
 * The `data` field holds the actual payload. This helper unwraps it while
 * also tolerating a bare payload (defensive).
 */
function extractSubAgentData(
  output: unknown,
): Record<string, unknown> | null {
  if (typeof output !== "object" || output === null || Array.isArray(output)) {
    return null;
  }
  const envelope = output as ToolResultEnvelopeShape;
  if (
    envelope.ok === true &&
    envelope.data &&
    typeof envelope.data === "object"
  ) {
    return envelope.data as Record<string, unknown>;
  }
  // Bare payload (no envelope wrapper) — treat output itself as data.
  return output as Record<string, unknown>;
}

/**
 * Renders a SubAgent invocation as a compact Label (spinner + task preview).
 *
 * After the refactor, a SubAgent IS a normal Session. The parent message's
 * tool invocation output carries `{ sessionId, status }` (wrapped in a
 * ToolResultEnvelope). Clicking the Label navigates to the child session's
 * detail page (Tab view in P1; for P0 it reuses the existing
 * `/chat/:sessionId` route).
 *
 * Legacy data (pre-refactor, with `__progress` field) is rendered as a
 * degraded "history record" notice instead of erroring (Q4).
 */
export function SubAgentLabel({ output, input, errorText }: SubAgentLabelProps) {
  const navigate = useNavigate();
  const data = extractSubAgentData(output);

  // Q4: legacy format (pre-refactor) — show degraded message, don't error.
  if (data?.__progress !== undefined) {
    return (
      <span className="text-xs text-muted-foreground">
        历史 SubAgent 记录 (无法展开)
      </span>
    );
  }

  if (errorText) {
    return <span className="text-xs text-destructive">SubAgent 失败</span>;
  }

  const sessionId = (data as SubAgentDataShape | null)?.sessionId;
  const status = (data as SubAgentDataShape | null)?.status ?? "running";
  const task = (input as SubAgentInputShape | null)?.task ?? "SubAgent 任务";

  const handleOpen = () => {
    if (sessionId) {
      navigate(paths.chat(sessionId));
    }
  };

  return (
    <button
      type="button"
      onClick={handleOpen}
      disabled={!sessionId}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs",
        "transition-colors hover:bg-accent",
        !sessionId && "cursor-default opacity-60"
      )}
      title={sessionId ? `查看 SubAgent: ${task}` : task}
    >
      {status === "running" && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === "completed" && <Check className="h-3 w-3 text-green-500" />}
      {(status === "error" || status === "cancelled") && (
        <X className="h-3 w-3 text-red-500" />
      )}
      <span className="max-w-[240px] truncate">{task}</span>
      {sessionId && <span className="text-muted-foreground">→</span>}
    </button>
  );
}
