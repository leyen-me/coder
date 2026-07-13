import { describe, expect, it } from "vitest";

import {
  createLongbridgePreset,
  isRemoteMcpServer,
  normalizeMcpServerConfig,
  parseHeadersLines,
} from "./server-config";

describe("server-config", () => {
  it("creates a Longbridge remote preset", () => {
    const preset = createLongbridgePreset("cn");
    expect(preset.transport).toBe("http");
    expect(preset.url).toBe("https://mcp.longbridge.cn");
    expect(isRemoteMcpServer(preset)).toBe(true);
  });

  it("parses header lines", () => {
    expect(parseHeadersLines("Authorization=Bearer abc\nX-Test=1")).toEqual({
      Authorization: "Bearer abc",
      "X-Test": "1",
    });
  });

  it("normalizes legacy stdio configs without remote fields", () => {
    const legacy = {
      id: "filesystem",
      name: "Filesystem",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      env: {},
      enabled: true,
    };

    const normalized = normalizeMcpServerConfig(legacy);
    expect(normalized.transport).toBe("stdio");
    expect(normalized.url).toBe("");
    expect(normalized.headers).toEqual({});
    expect(isRemoteMcpServer(normalized)).toBe(false);
  });
});
