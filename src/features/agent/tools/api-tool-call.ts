import { sanitizeToolCallArguments } from "./tool-display";
import type { AgentToolCall } from "./types";

/** OpenAI-compatible tool call shape required by chat completion APIs. */
export type ApiToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export function toApiToolCall(call: AgentToolCall): ApiToolCall {
  return {
    id: call.id,
    type: "function",
    function: {
      name: call.name,
      arguments: sanitizeToolCallArguments(call.arguments),
    },
  };
}

export function toApiToolCalls(calls: AgentToolCall[]): ApiToolCall[] {
  return calls.map(toApiToolCall);
}
