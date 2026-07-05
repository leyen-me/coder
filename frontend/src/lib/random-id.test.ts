import { afterEach, describe, expect, it, vi } from "vitest";

import { isUuidV4, randomUUID } from "./random-id";

describe("randomUUID", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns a v4 UUID from crypto.randomUUID when available", () => {
    const randomUUIDSpy = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("11111111-1111-4111-8111-111111111111");

    expect(randomUUID()).toBe("11111111-1111-4111-8111-111111111111");
    expect(randomUUIDSpy).toHaveBeenCalledOnce();
  });

  it("falls back when crypto.randomUUID throws in non-secure contexts", () => {
    vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
      throw new TypeError("crypto.randomUUID is not a function");
    });

    const id = randomUUID();

    expect(isUuidV4(id)).toBe(true);
  });

  it("falls back when crypto.randomUUID is missing", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0);
        return bytes;
      },
    });

    expect(randomUUID()).toBe("00000000-0000-4000-8000-000000000000");
  });

  it("uses Math.random as a last resort", () => {
    vi.stubGlobal("crypto", undefined);

    const id = randomUUID();

    expect(isUuidV4(id)).toBe(true);
  });
});
