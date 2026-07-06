import { describe, expect, it } from "vitest";

import { getAgentToolDefinitions } from "@/features/agent/tools/registry";
import { ASK_MODE_TOOL_NAMES } from "@/features/agent/tools/ask-tools";
import { PLAN_MODE_TOOL_NAMES } from "@/features/agent/tools/plan-tools";
import {
  ASK_QUESTION_TOOL_NAME,
  PLAN_CREATE_TOOL_NAME,
  PLAN_DELETE_TOOL_NAME,
  PLAN_LIST_TOOL_NAME,
  PLAN_READ_TOOL_NAME,
  PLAN_UPDATE_TOOL_NAME,
  TODO_WRITE_TOOL_NAME,
} from "@/features/agent/tools/definitions";

describe("getAgentToolDefinitions", () => {
  it("returns all tools including ask_question for agent mode", () => {
    const tools = getAgentToolDefinitions("agent");
    expect(tools.length).toBeGreaterThan(ASK_MODE_TOOL_NAMES.length);
    expect(tools.some((tool) => tool.function.name === ASK_QUESTION_TOOL_NAME)).toBe(
      true
    );
  });

  it("excludes plan-only tools from agent mode", () => {
    const tools = getAgentToolDefinitions("agent");
    const toolNames = tools.map((tool) => tool.function.name);
    expect(toolNames).not.toContain(PLAN_CREATE_TOOL_NAME);
    expect(toolNames).not.toContain(PLAN_READ_TOOL_NAME);
    expect(toolNames).not.toContain(PLAN_UPDATE_TOOL_NAME);
    expect(toolNames).not.toContain(PLAN_DELETE_TOOL_NAME);
    expect(toolNames).not.toContain(PLAN_LIST_TOOL_NAME);
  });

  it("returns only ask tools for ask mode", () => {
    const tools = getAgentToolDefinitions("ask");
    expect(tools.map((tool) => tool.function.name).sort()).toEqual(
      [...ASK_MODE_TOOL_NAMES].sort()
    );
    expect(tools.some((tool) => tool.function.name === ASK_QUESTION_TOOL_NAME)).toBe(
      true
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
