/**
 * coder run <prompt> — Run the agent in full mode.
 * coder <prompt> — Shorthand for the same.
 */

import type { GlobalOptions } from "./common";
import { runAgentSession } from "../agent/session";

export async function runCommand(
  prompt: string,
  options: GlobalOptions,
): Promise<void> {
  await runAgentSession(prompt, {
    ...options,
    agentMode: "agent",
    workspaceDir: options.workspace ?? process.cwd(),
    interactive: false,
  });
}
