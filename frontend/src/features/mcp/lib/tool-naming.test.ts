import { describe, expect, it } from "vitest";

import {
  buildMcpToolName,
  isMcpToolName,
  parseMcpToolName,
} from "./tool-naming";

describe("tool-naming", () => {
  it("builds and parses MCP tool names", () => {
    const name = buildMcpToolName("filesystem", "read_file");
    expect(name).toBe("mcp__filesystem__read_file");
    expect(parseMcpToolName(name)).toEqual({
      serverId: "filesystem",
      toolName: "read_file",
    });
    expect(isMcpToolName(name)).toBe(true);
  });

  it("rejects non-MCP tool names", () => {
    expect(parseMcpToolName("read_file")).toBeNull();
    expect(isMcpToolName("read_file")).toBe(false);
  });
});
