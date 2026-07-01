import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";
import type { AgentMode } from "../agent/types";

// Forward reference — will be set when the agent system initializes
let spawnAgentFunction: ((task: string, context?: string, tools?: string[]) => Promise<unknown>) | null = null;

export function setSpawnAgentFunction(
  fn: (task: string, context?: string, tools?: string[]) => Promise<unknown>,
): void {
  spawnAgentFunction = fn;
}

type SpawnSubAgentArgs = {
  task: string;
  context?: string;
  tools?: string[];
};

export const spawnSubAgentHandler: ToolHandler = async (rawArgs, _context) => {
  const args = rawArgs as SpawnSubAgentArgs;

  if (!args.task?.trim()) {
    return toolFailure("spawn_subagent", "invalid_arguments", "task is required");
  }

  if (!spawnAgentFunction) {
    return toolFailure(
      "spawn_subagent",
      "not_available",
      "Sub-agent spawning is not available in the current configuration.",
    );
  }

  try {
    const result = await spawnAgentFunction(args.task, args.context, args.tools);
    return toolSuccess("spawn_subagent", result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolFailure("spawn_subagent", "execution_error", message);
  }
};
