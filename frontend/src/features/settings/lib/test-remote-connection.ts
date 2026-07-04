import { apiPost } from "@/lib/api/client";
import type { RemoteTargetConfig } from "@/lib/db/types";

export type RemoteConnectionTestResult = {
  ok: boolean;
  message: string;
};

export async function testRemoteConnection(
  config: RemoteTargetConfig,
): Promise<RemoteConnectionTestResult> {
  return apiPost<RemoteConnectionTestResult>("/api/test_remote_connection", {
    config,
  });
}
