/**
 * Coder CLI — Entrypoint
 *
 * Usage:
 *   coder <prompt>              Run agent with prompt
 *   coder ask <prompt>          Run in ask mode
 *   coder plan <prompt>         Run in plan mode
 *   coder repl                  Start interactive REPL
 *   coder init                  Initialize configuration
 *   coder config                Show/edit configuration
 *   coder --version             Show version
 *   coder --help                Show help
 */

import { runCommand } from "./commands/run";
import { askCommand } from "./commands/ask";
import { planCommand } from "./commands/plan";
import { replCommand } from "./commands/repl";
import { initCommand } from "./commands/init";
import { configCommand } from "./commands/config";
import { setGlobalOptions } from "./commands/common";
import { error, writeError } from "./ui";

const VERSION = "0.1.0";

async function main() {
  // Quick help/version check before commander
  const rawArgs = process.argv.slice(2);

  if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
    printHelp();
    return;
  }

  if (rawArgs.includes("--version") || rawArgs.includes("-V")) {
    console.log(VERSION);
    return;
  }

  // If no args, start REPL
  if (rawArgs.length === 0) {
    await replCommand({});
    return;
  }

  // Extract global options from raw args
  const globalOpts = extractGlobalOptions(rawArgs);
  setGlobalOptions(globalOpts);

  // Check for known subcommands
  const firstNonFlag = rawArgs.find((a) => !a.startsWith("-"));
  const knownSubcommands: Record<string, (args: string[], opts: Record<string, unknown>) => Promise<void>> = {
    ask: async (args, opts) => { await askCommand(args.join(" "), opts); },
    plan: async (args, opts) => { await planCommand(args.join(" "), opts); },
    repl: async () => { await replCommand(globalOpts); },
    init: async () => { await initCommand(); },
    config: async (args) => { await configCommand(args[0], args[1]); },
  };

  if (firstNonFlag && knownSubcommands[firstNonFlag]) {
    const cmdArgs = rawArgs.slice(rawArgs.indexOf(firstNonFlag) + 1).filter((a) => !a.startsWith("-"));
    await knownSubcommands[firstNonFlag](cmdArgs, globalOpts);
    return;
  }

  // Everything else is treated as a prompt
  const promptParts = rawArgs.filter((a) => !a.startsWith("-"));
  const prompt = promptParts.join(" ");

  if (!prompt.trim()) {
    await replCommand(globalOpts);
    return;
  }

  await runCommand(prompt, globalOpts);
}

function extractGlobalOptions(args: string[]): Record<string, unknown> {
  const opts: Record<string, unknown> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-m" || arg === "--model") {
      opts.model = args[++i] ?? "";
    } else if (arg === "-p" || arg === "--provider") {
      opts.provider = args[++i] ?? "";
    } else if (arg === "-w" || arg === "--workspace") {
      opts.workspace = args[++i] ?? "";
    } else if (arg === "-y" || arg === "--yes") {
      opts.yes = true;
    } else if (arg === "--no-stream") {
      opts.stream = false;
    } else if (arg === "--stream") {
      opts.stream = true;
    }
  }
  return opts;
}

function printHelp(): void {
  console.log(`
Usage: coder [options] [prompt...]

Coder CLI — AI-powered coding assistant in the terminal

Options:
  -V, --version              output the version number
  -m, --model <model>        Model ID to use
  -p, --provider <provider>  Provider ID (deepseek, glm, agnes, nvidia, minimax, custom)
  -w, --workspace <path>     Workspace directory
  -y, --yes                  Auto-confirm prompts (unattended mode)
  --no-stream                Disable streaming output
  -h, --help                 display help for command

Commands:
  ask [prompt...]            Ask a question (read-only mode)
  plan [prompt...]           Create or work on a plan
  repl                       Start interactive REPL session
  init                       Initialize Coder CLI configuration
  config [key] [value]       View or edit configuration
`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  writeError(error(`Fatal: ${message}`));
  process.exit(1);
});
