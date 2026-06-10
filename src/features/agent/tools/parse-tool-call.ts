import type { AgentToolCall } from "./types";

type PartialToolCall = {
  id?: string;
  name?: string;
  arguments: string;
};

export type ToolCallIdentified = {
  id: string;
  name: string;
};

export function createToolCallAccumulator(options?: {
  onIdentified?: (call: ToolCallIdentified) => void;
}): {
  ingest: (delta: ToolCallDelta) => void;
  finalize: () => AgentToolCall[];
} {
  const calls = new Map<number, PartialToolCall>();
  const announcedIds = new Set<string>();

  const maybeAnnounce = (call: PartialToolCall) => {
    if (!call.id || !call.name || announcedIds.has(call.id)) {
      return;
    }

    announcedIds.add(call.id);
    options?.onIdentified?.({ id: call.id, name: call.name });
  };

  return {
    ingest(delta: ToolCallDelta) {
      const index = delta.index ?? 0;
      const current = calls.get(index) ?? { arguments: "" };

      if (delta.id) {
        current.id = delta.id;
      }

      const name = delta.function?.name;
      if (name) {
        current.name = name;
      }

      const argumentDelta = delta.function?.arguments;
      if (argumentDelta) {
        current.arguments += argumentDelta;
      }

      calls.set(index, current);
      maybeAnnounce(current);
    },
    finalize() {
      return [...calls.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, call]) => call)
        .filter(
          (call): call is AgentToolCall =>
            Boolean(call.id && call.name && call.arguments !== undefined)
        )
        .map((call) => ({
          id: call.id!,
          name: call.name!,
          arguments: call.arguments,
        }));
    },
  };
}

export type ToolCallDelta = {
  index?: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};
