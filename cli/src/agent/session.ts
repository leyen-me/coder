/**
 * Agent Session — manages a single agent session lifecycle.
 * Connects the agent loop to the CLI output.
 */

import type { AgentMode, AgentChatMessage, AgentEvent } from "./types";
import { runAgentWithTools } from "./runner";
import { resolveAgentEnvironment, buildSystemPrompt } from "./environment";
import { resolveProviderConfig, resolveApiKey, loadConfig } from "../config";
import type { ToolExecutionContext } from "../handlers/types";
import type { ThinkingParamsOverride } from "./thinking-config";
import { error, warning, info, dim, bold, success, writeStream, writeLine, writeError } from "../ui";

export type SessionOptions = {
  agentMode: AgentMode;
  workspaceDir: string;
  interactive: boolean;
  model?: string;
  provider?: string;
  stream?: boolean;
  /** Explicitly enable or disable deep thinking. When undefined, model defaults apply. */
  thinking?: boolean;
  /**
   * Existing conversation history to continue from.
   * When provided, the system prompt is assumed to already be in the messages.
   * The new user prompt will be appended.
   */
  existingMessages?: AgentChatMessage[];
};

/**
 * Run an agent session.
 * Returns the updated messages array so callers (e.g. REPL) can persist context.
 */
export async function runAgentSession(
  prompt: string,
  options: SessionOptions,
): Promise<AgentChatMessage[]> {
  const config = loadConfig();
  const workspaceDir = options.workspaceDir || null;

  // Resolve provider
  const providerId = (options.provider as any) ?? config.activeProvider;
  const resolvedConfig = resolveProviderConfig(config, providerId);
  const apiKey = resolveApiKey(resolvedConfig);

  // Resolve model
  const modelId = options.model ?? config.lastModel;

  // Determine whether thinking is supported for the resolved model
  const modelDef = resolvedConfig.models.find((m) => m.id === modelId);
  const supportsThinking =
    modelDef?.supportsThinking === true ||
    config.providers[resolvedConfig.provider]?.supportsThinking === true;
  const thinkingEnabled =
    options.thinking !== undefined && supportsThinking
      ? options.thinking
      : undefined;

  // Build custom thinking params override from config (for custom providers)
  let thinkingParamsOverride: ThinkingParamsOverride | undefined;
  if (thinkingEnabled !== undefined) {
    const settings = config.providers[resolvedConfig.provider];
    if (settings?.thinkingEnabledParams && settings?.thinkingDisabledParams) {
      thinkingParamsOverride = {
        enabled: settings.thinkingEnabledParams,
        disabled: settings.thinkingDisabledParams,
      };
    }
  }

  // Build messages — either continue from existing or start fresh
  let messages: AgentChatMessage[];

  if (options.existingMessages && options.existingMessages.length > 0) {
    // Continue conversation: existing messages already contain the system prompt.
    // Sanitize the history before reusing it — filter out assistant messages
    // that have neither content nor tool_calls (e.g. reasoning-only turns).
    messages = [
      ...sanitizeMessages(options.existingMessages),
      { role: "user", content: prompt },
    ];
  } else {
    // Fresh session: build system prompt
    const env = resolveAgentEnvironment(workspaceDir);
    const systemPrompt = buildSystemPrompt(env, options.agentMode);
    messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ];
  }

  const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const isStreaming = options.stream !== false;

  let currentContent = "";
  let currentThinking = "";
  let hasContent = false;
  let streamStarted = false;

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
    const finalMessages = await runAgentWithTools(
      {
        taskId,
        baseUrl: resolvedConfig.baseUrl,
        apiKey,
        apiKeySource: resolvedConfig.apiKeySource,
        apiKeyEnvVar: resolvedConfig.apiKeyEnvVar,
        model: modelId,
        messages,
        agentMode: options.agentMode,
        provider: providerId,
        thinkingEnabled,
        thinkingParams: thinkingParamsOverride,
      },
      toolContext,
      (event: AgentEvent) => {
        switch (event.type) {
          case "thinking_delta": {
            currentThinking += event.delta;
            if (isStreaming && !hasContent) {
              if (!streamStarted) {
                streamStarted = true;
                writeLine("");
              }
              writeStream(dim(event.delta));
            }
            break;
          }

          case "content_delta": {
            if (isStreaming) {
              if (!streamStarted) {
                streamStarted = true;
              }
              if (!hasContent && currentThinking) {
                // Transition from thinking to content
                writeLine("");
              }
              hasContent = true;
              currentContent += event.delta;
              writeStream(event.delta);
            }
            break;
          }

          case "tool_call_started": {
            if (isStreaming) {
              if (!streamStarted) {
                streamStarted = true;
                writeLine("");
              } else if (hasContent || currentThinking) {
                // Separator from content or thinking before showing tool
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
                writeLine(success("✓ Task completed"));
              } else {
                writeLine(success("✓ Task completed"));
                if (currentContent) {
                  writeLine("\n" + currentContent);
                }
              }
            } else if (event.status === "failed") {
              writeLine(error(`✗ Task failed`));
            } else if (event.status === "cancelled") {
              writeLine(warning(`⚠ Task cancelled`));
            }
            break;
          }

          case "done": {
            break;
          }

          case "error": {
            writeLine(error(`✗ Error: ${event.message}`));
            break;
          }
        }
      },
    );
    return finalMessages;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeError(error(`Fatal error: ${message}`));
    process.exit(1);
  }
}

/**
 * Sanitize conversation history before reusing it.
 * Filters out assistant messages that have neither content, reasoning_content,
 * nor tool_calls — these would cause API 400 errors on the next request.
 * Mirrors the desktop's hasMessagePayload filter in build-agent-messages.ts.
 */
function sanitizeMessages(messages: AgentChatMessage[]): AgentChatMessage[] {
  return messages.filter((msg) => {
    if (msg.role !== "assistant") return true;
    const text = typeof msg.content === "string" ? msg.content : undefined;
    return (
      Boolean(text?.trim()) ||
      Boolean(msg.reasoning_content?.trim()) ||
      Boolean(msg.tool_calls?.length)
    );
  });
}
