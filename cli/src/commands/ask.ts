/**
 * coder ask <prompt> — Run in ask (read-only) mode.
 */

import type { GlobalOptions } from "./common";
import { runAgentSession } from "../agent/session";

export async function askCommand(
  prompt: string,
  options: GlobalOptions,
): Promise<void> {
  await runAgentSession(prompt, {
    ...options,
    agentMode: "ask",
    workspaceDir: options.workspace ?? process.cwd(),
    interactive: false,
  });
}
