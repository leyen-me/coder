import { describe, expect, it, vi } from "vitest";

import { createToolCallAccumulator } from "./parse-tool-call";

describe("createToolCallAccumulator", () => {
  it("announces a tool call as soon as id and name are known", () => {
    const onIdentified = vi.fn();
    const accumulator = createToolCallAccumulator({ onIdentified });

    accumulator.ingest({
      index: 0,
      id: "call_1",
      function: { name: "list_dir" },
    });

    expect(onIdentified).toHaveBeenCalledTimes(1);
    expect(onIdentified).toHaveBeenCalledWith({
      id: "call_1",
      name: "list_dir",
    });
  });

  it("announces only once per tool call id", () => {
    const onIdentified = vi.fn();
    const accumulator = createToolCallAccumulator({ onIdentified });

    accumulator.ingest({
      index: 0,
      id: "call_1",
      function: { name: "list_dir" },
    });
    accumulator.ingest({
      index: 0,
      function: { arguments: '{"path":"."}' },
    });

    expect(onIdentified).toHaveBeenCalledTimes(1);
    expect(accumulator.finalize()).toEqual([
      {
        id: "call_1",
        name: "list_dir",
        arguments: '{"path":"."}',
      },
    ]);
  });
});
