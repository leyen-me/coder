import { afterEach, describe, expect, it, vi } from "vitest";

import { generateId, isUuidV4 } from "./generate-id";

describe("generateId", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses crypto.randomUUID when available", () => {
    const randomUUID = vi.fn(() => "11111111-1111-4111-8111-111111111111");
    vi.stubGlobal("crypto", { randomUUID });

    expect(generateId()).toBe("11111111-1111-4111-8111-111111111111");
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("falls back to getRandomValues when randomUUID is unavailable", () => {
    const bytes = Uint8Array.from({ length: 16 }, (_, index) => index);
    const getRandomValues = vi.fn((target: Uint8Array) => {
      target.set(bytes);
      return target;
    });

    vi.stubGlobal("crypto", { getRandomValues });

    const id = generateId();

    expect(getRandomValues).toHaveBeenCalledOnce();
    expect(isUuidV4(id)).toBe(true);
    expect(id).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  });

  it("falls back to nanoid when crypto is unavailable", () => {
    vi.stubGlobal("crypto", undefined);

    const id = generateId();

    expect(id.length).toBeGreaterThan(0);
    expect(isUuidV4(id)).toBe(false);
  });
});
