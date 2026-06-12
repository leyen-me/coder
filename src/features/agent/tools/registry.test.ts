import { describe, expect, it } from "vitest";

import { getAgentToolDefinitions } from "@/features/agent/tools/registry";
import { ASK_MODE_TOOL_NAMES } from "@/features/agent/tools/ask-tools";
import { PLAN_MODE_TOOL_NAMES } from "@/features/agent/tools/plan-tools";
import {
  ASK_QUESTION_TOOL_NAME,
  TODO_WRITE_TOOL_NAME,
} from "@/features/agent/tools/definitions";

describe("getAgentToolDefinitions", () => {
  it("returns all tools for agent mode", () => {
    const tools = getAgentToolDefinitions("agent");
    expect(tools.length).toBeGreaterThan(ASK_MODE_TOOL_NAMES.length);
    expect(tools.some((tool) => tool.function.name === ASK_QUESTION_TOOL_NAME)).toBe(
      false
    );
  });

  it("returns only ask tools for ask mode", () => {
    const tools = getAgentToolDefinitions("ask");
    expect(tools.map((tool) => tool.function.name).sort()).toEqual(
      [...ASK_MODE_TOOL_NAMES].sort()
    );
  });

  it("returns ask tools plus plan tools for plan mode", () => {
    const tools = getAgentToolDefinitions("plan");
    expect(tools.map((tool) => tool.function.name).sort()).toEqual(
      [...PLAN_MODE_TOOL_NAMES].sort()
    );
    expect(tools.some((tool) => tool.function.name === TODO_WRITE_TOOL_NAME)).toBe(
      true
    );
  });
});
