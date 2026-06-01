import { describe, expect, it } from "vitest";

import { DEFAULT_LOCALE } from "./constants";
import { formatMessage } from "./format-message";
import { parseLocale } from "./parse-locale";

describe("parseLocale", () => {
  it("accepts supported locales", () => {
    expect(parseLocale("zh")).toBe("zh");
    expect(parseLocale("en")).toBe("en");
  });

  it("falls back to the default locale for invalid values", () => {
    expect(parseLocale(null)).toBe(DEFAULT_LOCALE);
    expect(parseLocale("fr")).toBe(DEFAULT_LOCALE);
  });
});

describe("formatMessage", () => {
  it("replaces named placeholders", () => {
    expect(formatMessage("Hello {name}", { name: "Coder" })).toBe("Hello Coder");
  });
});
