/**
 * Coder CLI — Entrypoint
 *
 * Usage:
 *   coder                     Start interactive REPL
 *   coder ask <prompt>        Run in ask (read-only) mode
 *   coder run <prompt>        Run in agent (full access) mode
 *   coder init                Initialize configuration
 *   coder config              Show/edit configuration
 *   coder --version           Show version
 *   coder --help              Show help
 */

import { runCommand } from "./commands/run";
import { askCommand } from "./commands/ask";
import { replCommand } from "./commands/repl";
import { initCommand } from "./commands/init";
import { configCommand } from "./commands/config";
import { setGlobalOptions } from "./commands/common";
import { error, info, writeError, writeLine } from "./ui";

const VERSION = process.env.CLI_VERSION ?? "0.0.0";

async function main() {
  // Quick help/version check before commander
  const rawArgs = process.argv.slice(2);

  if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
    printHelp();
    return;
  }

  if (rawArgs.includes("--version") || rawArgs.includes("-v")) {
    console.log(VERSION);
    return;
  }

  // Extract global options from raw args (must be done before subcommand dispatch)
  const globalOpts = extractGlobalOptions(rawArgs);
  setGlobalOptions(globalOpts);

  // If no args, start REPL
  if (rawArgs.length === 0) {
    await replCommand({});
    return;
  }

  // Find known subcommands
  const firstNonFlag = rawArgs.find((a) => !a.startsWith("-"));
  const knownSubcommands: Record<string, (args: string[], opts: Record<string, unknown>) => Promise<void>> = {
    ask: async (args, opts) => { await askCommand(args.join(" "), opts); },
    run: async (args, opts) => { await runCommand(args.join(" "), opts); },
    init: async () => { await initCommand(); },
    config: async (args) => { await configCommand(args[0], args[1]); },
  };
  if (firstNonFlag && knownSubcommands[firstNonFlag]) {
    const cmdArgs = rawArgs.slice(rawArgs.indexOf(firstNonFlag) + 1).filter((a) => !a.startsWith("-"));
    await knownSubcommands[firstNonFlag](cmdArgs, globalOpts);
    return;
  }

  // Unknown subcommand — show error
  writeLine(error(`Unknown subcommand "${firstNonFlag}".`));
  writeLine("");
  writeLine(info("Usage: coder <command> [options] [prompt...]"));
  writeLine(info("Run 'coder --help' for available commands."));
  process.exit(1);
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
Usage: coder <command> [options] [prompt...]

Coder CLI — AI-powered coding assistant in the terminal

Options:
  -v, --version              output the version number
  -m, --model <model>        Model ID to use
  -p, --provider <provider>  Provider ID (deepseek, glm, agnes, nvidia, minimax, custom)
  -w, --workspace <path>     Workspace directory
  -y, --yes                  Auto-confirm prompts (unattended mode)
  --no-stream                Disable streaming output
  -h, --help                 display help for command

Commands:
  ask [prompt...]            Ask a question (read-only mode)
  run [prompt...]            Run in full agent mode (can modify files, run commands)
  init                       Initialize Coder CLI configuration
  config [key] [value]       View or edit configuration
`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  writeError(error(`Fatal: ${message}`));
  process.exit(1);
});
