/**
 * Agent Session — manages a single agent session lifecycle.
 * Connects the agent loop to the CLI output.
 */

import type { AgentMode, AgentChatMessage, AgentEvent } from "./types";
import { runAgentWithTools } from "./runner";
import { resolveAgentEnvironment, buildSystemPrompt } from "./environment";
import { resolveProviderConfig, resolveApiKey, loadConfig } from "../config";
import type { ToolExecutionContext } from "../handlers/types";
import { error, warning, info, dim, bold, success, writeStream, writeLine, writeError } from "../ui";

export type SessionOptions = {
  agentMode: AgentMode;
  workspaceDir: string;
  interactive: boolean;
  model?: string;
  provider?: string;
  stream?: boolean;
};

export async function runAgentSession(
  prompt: string,
  options: SessionOptions,
): Promise<void> {
  const config = loadConfig();
  const workspaceDir = options.workspaceDir || null;

  // Resolve provider
  const providerId = (options.provider as any) ?? config.activeProvider;
  const resolvedConfig = resolveProviderConfig(config, providerId);
  const apiKey = resolveApiKey(resolvedConfig);

  // Resolve model
  const modelId = options.model ?? config.lastModel;

  // Resolve environment
  const env = resolveAgentEnvironment(workspaceDir);
  const systemPrompt = buildSystemPrompt(env);

  // Build messages
  const messages: AgentChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt },
  ];

  const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const isStreaming = options.stream !== false;

  let currentContent = "";
  let currentThinking = "";
  let hasContent = false;

  // Tool execution context
  const toolContext: ToolExecutionContext = {
    workspaceDir,
    sessionId: taskId,
    taskId,
    agentMode: options.agentMode,
  };

  if (!isStreaming) {
    writeLine(`${info("ℹ")} Running agent in ${bold(options.agentMode)} mode...\n`);
  }

  try {
    await runAgentWithTools(
      {
        taskId,
        baseUrl: resolvedConfig.baseUrl,
        apiKey,
        apiKeySource: resolvedConfig.apiKeySource,
        apiKeyEnvVar: resolvedConfig.apiKeyEnvVar,
        model: modelId,
        messages,
      },
      toolContext,
      (event: AgentEvent) => {
        switch (event.type) {
          case "thinking_delta": {
            currentThinking += event.delta;
            if (isStreaming && !hasContent) {
              writeStream(dim(event.delta));
            }
            break;
          }

          case "content_delta": {
            if (!hasContent && currentThinking && isStreaming) {
              // Transition from thinking to content
              writeLine("");
              hasContent = true;
            }
            hasContent = true;
            currentContent += event.delta;
            if (isStreaming) {
              writeStream(event.delta);
            }
            break;
          }

          case "tool_call_started": {
            if (isStreaming) {
              if (hasContent || currentThinking) {
                writeLine("");
              }
              writeLine(`${dim("🔧")} ${bold(event.name)}${dim("...")}`);
            }
            break;
          }

          case "tool_call_finished": {
            if (event.errorText) {
              writeLine(`  ${error("✗")} ${dim(event.errorText.slice(0, 200))}`);
            } else if (isStreaming) {
              writeLine(`  ${success("✓")} ${dim("done")}`);
            }
            break;
          }

          case "status": {
            if (event.status === "completed") {
              if (isStreaming) {
                writeLine("");
                writeLine(success(`\n✓ Task completed`));
              } else {
                writeLine(success(`✓ Task completed`));
                if (currentContent) {
                  writeLine("\n" + currentContent);
                }
              }
            } else if (event.status === "failed") {
              writeLine(error(`\n✗ Task failed`));
            } else if (event.status === "cancelled") {
              writeLine(warning(`\n⚠ Task cancelled`));
            }
            break;
          }

          case "done": {
            if (event.usage && config.showUsage) {
              writeLine(dim(
                `  Tokens: ${event.usage.promptTokens}↑ ${event.usage.completionTokens}↓ ${event.usage.totalTokens}∑`,
              ));
            }
            break;
          }

          case "error": {
            writeLine(error(`\n✗ Error: ${event.message}`));
            break;
          }
        }
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeError(error(`Fatal error: ${message}`));
    process.exit(1);
  }
}
