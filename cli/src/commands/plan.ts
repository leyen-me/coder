/**
 * coder plan <prompt> — Run in plan mode.
 */

import type { GlobalOptions } from "./common";
import { runAgentSession } from "../agent/session";

export async function planCommand(
  prompt: string,
  options: GlobalOptions,
): Promise<void> {
  await runAgentSession(prompt, {
    ...options,
    agentMode: "plan",
    workspaceDir: options.workspace ?? process.cwd(),
    interactive: false,
  });
}
