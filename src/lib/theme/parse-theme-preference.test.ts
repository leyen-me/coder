import { describe, expect, it } from "vitest";

import { DEFAULT_THEME_PREFERENCE } from "./constants";
import { parseThemePreference } from "./parse-theme-preference";

describe("parseThemePreference", () => {
  it("accepts valid theme preferences", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBe("system");
  });

  it("falls back to the default for invalid values", () => {
    expect(parseThemePreference(null)).toBe(DEFAULT_THEME_PREFERENCE);
    expect(parseThemePreference("invalid")).toBe(DEFAULT_THEME_PREFERENCE);
    expect(parseThemePreference(undefined)).toBe(DEFAULT_THEME_PREFERENCE);
  });
});
