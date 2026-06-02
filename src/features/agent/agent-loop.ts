import {
  executeToolCall,
  getAgentToolDefinitions,
  serializeToolResult,
} from "./tools";
import type { AgentToolCall } from "./tools/types";
import { startAgent } from "./runner";
import type { AgentEvent, AgentEventHandler, AgentStartInput } from "./types";
import { MAX_AGENT_TOOL_ITERATIONS } from "./types";

type ToolExecutionContextInput = {
  workspaceDir: string | null;
};

export async function runAgentWithTools(
  input: AgentStartInput,
  context: ToolExecutionContextInput,
  onEvent: AgentEventHandler
): Promise<void> {
  let messages = [...input.messages];
  const tools = input.tools ?? getAgentToolDefinitions();

  for (let iteration = 0; iteration < MAX_AGENT_TOOL_ITERATIONS; iteration += 1) {
    const bufferedOutput: AgentEvent[] = [];
    const toolCalls = await runSingleAgentTurn(
      {
        ...input,
        messages,
        tools,
        emitAssistantOutput: false,
      },
      (event) => {
        if (isAssistantOutputEvent(event)) {
          bufferedOutput.push(event);
          return;
        }
        onEvent(event);
      }
    );

    if (toolCalls.length === 0) {
      for (const event of bufferedOutput) {
        onEvent(event);
      }
      onEvent({ type: "done", taskId: input.taskId });
      onEvent({ type: "status", taskId: input.taskId, status: "completed" });
      return;
    }

    if (iteration === MAX_AGENT_TOOL_ITERATIONS - 1) {
      throw new Error("Maximum tool iterations exceeded");
    }

    messages = await appendToolResults(messages, toolCalls, context);
  }
}

async function runSingleAgentTurn(
  input: AgentStartInput,
  onEvent: AgentEventHandler
): Promise<AgentToolCall[]> {
  return new Promise<AgentToolCall[]>((resolve, reject) => {
    let toolCalls: AgentToolCall[] = [];
    let settled = false;

    const finish = (handler: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      handler();
    };

    void startAgent(input, (event) => {
      if (event.type === "turn_complete") {
        toolCalls = event.toolCalls;
        finish(() => resolve(toolCalls));
        return;
      }

      if (event.type === "done") {
        return;
      }

      if (event.type === "status") {
        if (event.status === "completed") {
          finish(() => resolve(toolCalls));
          return;
        }

        if (
          event.status === "failed" ||
          event.status === "cancelled"
        ) {
          finish(() =>
            reject(new Error(`Agent turn ended with status: ${event.status}`))
          );
          return;
        }
      }

      if (event.type === "error") {
        onEvent(event);
        finish(() => reject(new Error(event.message)));
        return;
      }

      onEvent(event);
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      finish(() => reject(new Error(message)));
    });
  });
}

function isAssistantOutputEvent(event: AgentEvent): boolean {
  return event.type === "thinking_delta" || event.type === "content_delta";
}

async function appendToolResults(
  messages: AgentStartInput["messages"],
  toolCalls: AgentToolCall[],
  context: ToolExecutionContextInput
): Promise<AgentStartInput["messages"]> {
  const nextMessages = [
    ...messages,
    {
      role: "assistant" as const,
      content: "",
      tool_calls: toolCalls,
    },
  ];

  for (const call of toolCalls) {
    const result = await executeToolCall(call.name, call.arguments, {
      workspaceDir: context.workspaceDir,
    });

    nextMessages.push({
      role: "tool",
      tool_call_id: call.id,
      name: call.name,
      content: serializeToolResult(result),
    });
  }

  return nextMessages;
}
