import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
  apiPost: vi.fn(),
}));

import { apiPost } from "@/lib/api/client";
import { testRemoteConnection } from "./test-remote-connection";
import type { RemoteTargetConfig } from "@/lib/db/types";

const target: RemoteTargetConfig = {
  alias: "prod",
  host: "example.com",
  port: 22,
  user: "deploy",
  auth: { type: "agent" },
  enabled: true,
};

describe("testRemoteConnection", () => {
  it("posts the remote target config to the HTTP endpoint", async () => {
    vi.mocked(apiPost).mockResolvedValue({ ok: true, message: "Connected" });

    await expect(testRemoteConnection(target)).resolves.toEqual({
      ok: true,
      message: "Connected",
    });

    expect(apiPost).toHaveBeenCalledWith("/api/test_remote_connection", {
      config: target,
    });
  });
});
