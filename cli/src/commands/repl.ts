/**
 * coder repl — Start interactive REPL session.
 */

import { createInterface } from "node:readline";
import type { GlobalOptions } from "./common";
import { runAgentSession } from "../agent/session";
import { bold, dim, info, error, writeLine, writeError } from "../ui";
import { loadConfig } from "../config";

export async function replCommand(options: GlobalOptions): Promise<void> {
  const config = loadConfig();
  const workspaceDir = options.workspace ?? process.cwd();

  writeLine("");
  writeLine(bold("Coder CLI — Interactive REPL"));
  writeLine(dim("───────────────────────────────────────"));
  writeLine(dim(`  Model: ${config.lastModel || "not set"}`));
  writeLine(dim(`  Provider: ${config.activeProvider}`));
  writeLine(dim(`  Workspace: ${workspaceDir}`));
  writeLine(dim(`  Type 'exit' or Ctrl+C to quit`));
  writeLine(dim("───────────────────────────────────────"));
  writeLine("");

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${bold("coder")}> `,
    terminal: true,
  });

  rl.prompt();

  rl.on("line", async (line: string) => {
    const trimmed = line.trim();

    if (!trimmed) {
      rl.prompt();
      return;
    }

    if (trimmed === "exit" || trimmed === "quit") {
      rl.close();
      return;
    }

    if (trimmed === "clear") {
      console.clear();
      rl.prompt();
      return;
    }

    if (trimmed === "help") {
      writeLine(bold("\nREPL Commands:"));
      writeLine("  <prompt>          Ask the agent anything");
      writeLine("  exit / quit       Exit REPL");
      writeLine("  clear             Clear screen");
      writeLine("  help              Show this help");
      writeLine("  model <id>        Switch model");
      writeLine("");
      rl.prompt();
      return;
    }

    if (trimmed.startsWith("model ")) {
      const modelId = trimmed.slice(6).trim();
      if (modelId) {
        config.lastModel = modelId;
        const { saveConfig } = await import("../config");
        saveConfig(config);
        writeLine(info(`Model set to: ${modelId}`));
      }
      rl.prompt();
      return;
    }

    // Run the agent with the given prompt
    rl.pause();

    try {
      await runAgentSession(trimmed, {
        agentMode: "agent",
        workspaceDir,
        interactive: true,
        model: options.model,
        provider: options.provider,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      writeError(error(`Error: ${message}`));
    }

    writeLine("");
    rl.prompt();
    rl.resume();
  });

  rl.on("close", () => {
    writeLine(dim("\nGoodbye! 👋"));
    process.exit(0);
  });

  rl.on("SIGINT", () => {
    rl.close();
  });
}
