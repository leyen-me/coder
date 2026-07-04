import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

import { apiGet, apiPost } from "@/lib/api/client";
import { createHttpKvStore } from "./http-kv";

describe("createHttpKvStore", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockResolvedValue({});
    vi.mocked(apiPost).mockResolvedValue({ ok: true });
  });

  it("rolls back cache when setItem persistence fails", async () => {
    vi.mocked(apiPost).mockRejectedValueOnce(new Error("backend unavailable"));
    const store = createHttpKvStore();
    await store.ready();

    store.setItem("coder:theme", "dark");
    await Promise.resolve();

    expect(store.getItem("coder:theme")).toBeNull();
  });

  it("restores previous value when setItem persistence fails", async () => {
    const kv = createHttpKvStore();
    await kv.ready();
    kv.setItem("coder:theme", "light");

    vi.mocked(apiPost).mockRejectedValueOnce(new Error("backend unavailable"));
    kv.setItem("coder:theme", "dark");
    await Promise.resolve();

    expect(kv.getItem("coder:theme")).toBe("light");
  });
});
