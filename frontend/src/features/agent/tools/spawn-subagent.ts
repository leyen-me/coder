import { buildThinkingRequestExtensions } from "../thinking-preference";
import { SPAWN_SUBAGENT_TOOL_NAME } from "./definitions";
import { getAgentToolDefinitions } from "./registry";
import { toolFailure, toolSuccess } from "./result";
import type {
  SubAgentInput,
  SubAgentOutput,
  SubAgentStep,
  ToolHandler,
} from "./types";
import { cancelAgent } from "../runner";
import type { AgentChatMessage, AgentEvent } from "../types";

const MAX_DEPTH = 3;

export const spawnSubAgentHandler: ToolHandler = async (rawArgs, context) => {
  // Lazy import to avoid circular dependency: agent-loop.ts -> tools -> registry -> spawn-subagent -> agent-loop
  const { runAgentWithTools } = await import("../agent-loop");
  const args = parseSubAgentArgs(rawArgs);

  if (!args.ok) {
    return toolFailure(
      SPAWN_SUBAGENT_TOOL_NAME,
      "invalid_arguments",
      args.message
    );
  }

  if (!args.value.task.trim()) {
    return toolFailure(
      SPAWN_SUBAGENT_TOOL_NAME,
      "empty_task",
      "Task description must not be empty."
    );
  }

  // Validate provider config is available
  const providerConfig = context.spawnSubAgentConfig;
  if (!providerConfig) {
    return toolFailure(
      SPAWN_SUBAGENT_TOOL_NAME,
      "missing_provider_config",
      "spawn_subagent requires provider configuration. This tool is only available during active agent sessions."
    );
  }

  // Check nesting depth
  const currentDepth = contextDepth(context);
  if (currentDepth >= MAX_DEPTH) {
    return toolFailure(
      SPAWN_SUBAGENT_TOOL_NAME,
      "max_depth_exceeded",
      `Maximum nesting depth (${MAX_DEPTH}) exceeded. Cannot spawn sub-agent at depth ${currentDepth + 1}.`
    );
  }

  const subTaskId = `${context.taskId ?? "root"}/sub-${Date.now()}`;
  const steps: SubAgentStep[] = [];
  let finalContent = "";
  let finalError: string | undefined;

  // Build system prompt for the sub-agent
  const systemPrompt = buildSubAgentSystemPrompt(args.value, currentDepth);

  // Build messages list: system + user task
  const messages: AgentChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: args.value.task },
  ];

  // Build tools list for the sub-agent — explicitly exclude spawn_subagent
  // to prevent recursive spawning beyond the depth limit.
  const allTools = getAgentToolDefinitions("agent").filter(
    (t) => t.function.name !== SPAWN_SUBAGENT_TOOL_NAME
  );
  const tools = args.value.tools
    ? allTools.filter((t) => args.value.tools!.includes(t.function.name))
    : allTools;

  // Create a child abort controller linked to parent signal
  const abortController = new AbortController();
  const parentSignal = context.signal;
  if (parentSignal) {
    const onParentAbort = () => {
      abortController.abort();
      // Immediately cancel the sub-agent on the Rust side, since AbortController
      // cannot interrupt an in-flight agent_start HTTP request.
      cancelAgent(subTaskId).catch(() => {});
    };
    parentSignal.addEventListener("abort", onParentAbort, { once: true });
  }

  try {
    await runAgentWithTools(
      {
        taskId: subTaskId,
        baseUrl: providerConfig.baseUrl,
        apiKey: providerConfig.apiKey,
        apiKeySource: providerConfig.apiKeySource,
        apiKeyEnvVar: providerConfig.apiKeyEnvVar,
        model: providerConfig.model,
        messages,
        tools,
        requestExtensions: buildThinkingRequestExtensions({
          models: providerConfig.models,
          modelId: providerConfig.model,
          thinkingEnabled: providerConfig.thinkingEnabled ?? false,
        }),
        agentMode: "agent",
      },
      {
        workspaceDir: context.workspaceDir,
        sessionId: context.sessionId ?? "",
        taskId: subTaskId,
        signal: abortController.signal,
        tavilyConfig: context.tavilyConfig,
        allowPrivateNetworkAccess: context.allowPrivateNetworkAccess,
        agentMode: "agent",
      },
      (event: AgentEvent) => {
        collectSubAgentEvent(event, steps);
        if (event.type === "content_delta") {
          finalContent += event.delta;
        }
        // Emit partial progress to UI only at step boundaries (tool started/finished),
        // not on every thinking token. The steps array is still accumulated in memory.
        if (
          event.type === "tool_call_started" ||
          event.type === "tool_call_finished"
        ) {
          const rounds = steps.filter((s) => s.kind === "reasoning").length;
          const toolCalls = steps.filter((s) => s.kind === "tool").length;
          context.emitProgress?.({
            task: args.value.task,
            steps: [...steps],
            summary: "",
            rounds,
            toolCalls,
            content: finalContent.trim() || undefined,
          } satisfies SubAgentOutput);
        }
      }
    );
  } catch (error: unknown) {
    if (abortController.signal.aborted) {
      finalError = "Sub-agent was cancelled.";
      // The parent was cancelled — also abort the sub-agent's HTTP request,
      // which runs independently via startAgent() and won't stop on its own.
      cancelAgent(subTaskId).catch(() => {});
    } else {
      finalError =
        error instanceof Error ? error.message : "Unknown sub-agent error.";
    }
  }

  // Count rounds and tool calls from steps
  const rounds = steps.filter((s) => s.kind === "reasoning").length;
  const toolCalls = steps.filter((s) => s.kind === "tool").length;

  // Build summary from steps
  const summary = buildSummary(steps, args.value.task, finalError);

  const output: SubAgentOutput = {
    task: args.value.task,
    steps,
    summary,
    rounds,
    toolCalls,
    error: finalError,
    content: finalContent.trim() || undefined,
  };

  if (finalError) {
    return toolFailure(
      SPAWN_SUBAGENT_TOOL_NAME,
      abortController.signal.aborted ? "cancelled" : "subagent_failed",
      finalError,
    );
  }

  return toolSuccess(SPAWN_SUBAGENT_TOOL_NAME, output);
};

function parseSubAgentArgs(
  rawArgs: unknown
): { ok: true; value: SubAgentInput } | { ok: false; message: string } {
  if (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs)) {
    return { ok: false, message: "Arguments must be a JSON object." };
  }

  const record = rawArgs as Record<string, unknown>;
  const task = typeof record.task === "string" ? record.task : "";

  if (!task) {
    return { ok: false, message: "Missing required field: task" };
  }

  const contextValue =
    typeof record.context === "string" ? record.context : undefined;
  const tools = Array.isArray(record.tools)
    ? (record.tools as string[]).filter((t) => typeof t === "string")
    : undefined;

  return {
    ok: true,
    value: { task, context: contextValue, tools },
  };
}

function contextDepth(context: { taskId?: string }): number {
  const taskId = context.taskId ?? "";
  // Depth is encoded in taskId like "root/sub-123/sub-456"
  const matches = taskId.match(/\/sub-/g);
  return matches ? matches.length : 0;
}

function buildSubAgentSystemPrompt(
  input: SubAgentInput,
  depth: number
): string {
  const contextSection = input.context
    ? `\n\n## Additional Context\n${input.context}`
    : "";

  const toolSection = input.tools
    ? `\n\n## Allowed Tools\nYou may only use the following tools: ${input.tools.join(", ")}.`
    : "";

  return `You are a sub-agent operating at nesting depth ${depth + 1} (maximum: ${MAX_DEPTH}).

## Your Role
You are a focused assistant that performs a specific sub-task delegated by the parent agent. Complete the task below efficiently and report your findings.

## Constraints
- You have access to the same workspace and tools as the parent agent.
- Do not spawn further sub-agents.
- Keep your work focused on the delegated task.
- When finished, provide a concise summary of what was accomplished.
${contextSection}
${toolSection}`;
}

function collectSubAgentEvent(
  event: AgentEvent,
  steps: SubAgentStep[]
): void {
  switch (event.type) {
    case "thinking_delta": {
      const delta = event.delta.trim();
      if (delta) {
        const last = steps[steps.length - 1];
        if (last?.kind === "reasoning") {
          last.text += event.delta;
        } else {
          steps.push({
            kind: "reasoning",
            text: event.delta,
          });
        }
      }
      break;
    }
    case "tool_call_started": {
      const inputRecord =
        typeof event.input === "object" && event.input !== null
          ? (event.input as Record<string, unknown>)
          : {};
      const label = extractToolLabel(event.name, inputRecord);
      steps.push({
        kind: "tool",
        text: event.name,
        toolName: event.name,
        toolLabel: label,
        state: "running",
      });
      break;
    }
    case "tool_call_finished": {
      // Mark the last tool step as completed
      for (let i = steps.length - 1; i >= 0; i--) {
        const step = steps[i];
        if (step.kind === "tool" && step.state === "running") {
          step.state = event.errorText ? "error" : "completed";
          break;
        }
      }
      break;
    }
  }
}

function extractToolLabel(
  toolName: string,
  input: Record<string, unknown>
): string {
  switch (toolName) {
    case "shell":
    case "await": {
      const desc =
        typeof input.description === "string"
          ? input.description.trim()
          : "";
      const cmd =
        typeof input.command === "string" ? input.command.trim() : "";
      const label = desc || cmd;
      return label.length > 40 ? `${label.slice(0, 40)}…` : label;
    }
    case "grep": {
      const pattern =
        typeof input.pattern === "string" ? input.pattern.trim() : "";
      return pattern.length > 36 ? `${pattern.slice(0, 36)}…` : pattern;
    }
    case "glob": {
      const glob =
        typeof input.glob_pattern === "string"
          ? input.glob_pattern.trim()
          : "";
      return glob.length > 36 ? `${glob.slice(0, 36)}…` : glob;
    }
    case "read_file": {
      const p =
        typeof input.path === "string" ? input.path.trim() : "";
      return p.length > 40 ? `${p.slice(0, 40)}…` : p;
    }
    case "web_search": {
      const q =
        typeof input.search_term === "string"
          ? input.search_term.trim()
          : "";
      return q.length > 36 ? `${q.slice(0, 36)}…` : q;
    }
    case "list_dir": {
      const p =
        typeof input.path === "string" ? input.path.trim() : "";
      return p.length > 40 ? `${p.slice(0, 40)}…` : p;
    }
    default:
      return "";
  }
}

function buildSummary(
  steps: SubAgentStep[],
  task: string,
  error?: string
): string {
  if (error) {
    return `Task "${task.slice(0, 60)}${task.length > 60 ? "…" : ""}" encountered an error: ${error}`;
  }

  const toolSteps = steps.filter((s) => s.kind === "tool");
  const reasoningSteps = steps.filter((s) => s.kind === "reasoning");

  if (toolSteps.length === 0 && reasoningSteps.length === 0) {
    return `Task "${task.slice(0, 60)}${task.length > 60 ? "…" : ""}" completed directly.`;
  }

  const toolNames = [
    ...new Set(toolSteps.map((s) => s.toolName).filter(Boolean)),
  ];

  return `Completed task using ${toolSteps.length} tool call${toolSteps.length !== 1 ? "s" : ""} across ${reasoningSteps.length || 1} round${(reasoningSteps.length || 1) !== 1 ? "s" : ""}. Tools used: ${toolNames.join(", ") || "none"}.`;
}
