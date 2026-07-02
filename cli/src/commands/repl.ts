/**
 * coder repl — Start interactive REPL session.
 */

import { createInterface } from "node:readline";
import type { GlobalOptions } from "./common";
import { runAgentSession } from "../agent/session";
import type { AgentChatMessage } from "../agent/types";
import { bold, dim, info, error, warning, writeLine, writeError } from "../ui";
import { loadConfig } from "../config";
import { killAllShells } from "../handlers/shell-manager";

export async function replCommand(options: GlobalOptions): Promise<void> {
  const config = loadConfig();
  const workspaceDir = options.workspace ?? process.cwd();

  writeLine("");
  writeLine(bold("Coder CLI — Interactive REPL"));
  writeLine(dim("───────────────────────────────────────"));
  writeLine(dim(`  Model: ${config.lastModel || "not set"}`));
  writeLine(dim(`  Provider: ${config.activeProvider}`));
  writeLine(dim(`  Workspace: ${workspaceDir}`));
  writeLine(dim(`  Type '/help' for commands, '/exit' or Ctrl+C to quit`));
  writeLine(dim("───────────────────────────────────────"));
  writeLine("");

  // Persistent conversation context across REPL turns
  let conversationMessages: AgentChatMessage[] | undefined;
  let thinkingEnabled = true; // default to enabled for providers that support it
  let abortController = new AbortController();
  let agentRunning = false; // guards against re-entrance

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

    // Re-entrance guard: if the agent is already running (e.g. user pressed
    // Enter twice), ignore the input rather than pausing stdin — pausing
    // stdin prevents readline from detecting Ctrl+C in raw mode.
    if (agentRunning) {
      rl.prompt();
      return;
    }

    if (trimmed === "/exit" || trimmed === "/quit") {
      rl.close();
      return;
    }

    if (trimmed === "/clear") {
      console.clear();
      rl.prompt();
      return;
    }

    if (trimmed === "/new") {
      conversationMessages = undefined;
      abortController = new AbortController();
      writeLine(info("Started a new session. Context has been cleared."));
      rl.prompt();
      return;
    }

    if (trimmed === "/help") {
      writeLine(bold("\nREPL Commands:"));
      writeLine("  <prompt>             Ask the agent anything");
      writeLine("  /exit, /quit         Exit REPL");
      writeLine("  /clear               Clear screen");
      writeLine("  /new                 Clear context, start a new session");
      writeLine("  /help                Show this help");
      writeLine("  /model <id>          Switch model");
      writeLine(`  /thinking <on|off>   Toggle deep thinking (currently: ${thinkingEnabled ? "on" : "off"})`);
      writeLine("");
      rl.prompt();
      return;
    }

    if (trimmed.startsWith("/model ")) {
      const modelId = trimmed.slice(7).trim();
      if (modelId) {
        config.lastModel = modelId;
        const { saveConfig } = await import("../config");
        saveConfig(config);
        writeLine(info(`Model set to: ${modelId}`));
      }
      rl.prompt();
      return;
    }

    if (trimmed.startsWith("/thinking ")) {
      const value = trimmed.slice(10).trim().toLowerCase();
      if (value === "on" || value === "true") {
        thinkingEnabled = true;
        writeLine(info("Deep thinking: on"));
      } else if (value === "off" || value === "false") {
        thinkingEnabled = false;
        writeLine(info("Deep thinking: off"));
      } else {
        writeLine(error(`Usage: /thinking <on|off>  (currently: ${thinkingEnabled ? "on" : "off"})`));
      }
      rl.prompt();
      return;
    }

    // Run the agent with the given prompt
    agentRunning = true;

    try {
      conversationMessages = await runAgentSession(trimmed, {
        agentMode: "agent",
        workspaceDir,
        interactive: true,
        thinking: thinkingEnabled,
        existingMessages: conversationMessages,
        signal: abortController.signal,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      writeError(error(`Error: ${message}`));
    }
    agentRunning = false;
    // Reset the abort controller for the next turn — once aborted,
    // a signal stays aborted permanently and would cancel the next
    // request immediately.
    abortController = new AbortController();

    writeLine("");
    rl.prompt();
  });

  rl.on("close", () => {
    killAllShells();
    writeLine(dim("\nGoodbye! 👋"));
    process.exit(0);
  });

  rl.on("SIGINT", () => {
    if (agentRunning) {
      // Cancel current request
      abortController.abort();
      writeLine("");
      writeLine(warning("⚠ Cancelled"));
      // Don't prompt here — the line handler will show the prompt
      // when the agent finishes unwinding from the abort.
    } else {
      // Not running — Ctrl+C exits
      rl.close();
    }
  });
}
