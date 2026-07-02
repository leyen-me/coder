/**
 * Shared types and helpers for CLI commands.
 */

import type { AgentMode } from "../agent/types";

export type GlobalOptions = {
  workspace?: string;
  stream?: boolean;
  thinking?: boolean;
};

export type CommandContext = GlobalOptions & {
  agentMode: AgentMode;
};

let _globalOptions: GlobalOptions = {};

export function setGlobalOptions(opts: GlobalOptions): void {
  _globalOptions = opts;
}

export function getGlobalOptions(): GlobalOptions {
  return _globalOptions;
}
