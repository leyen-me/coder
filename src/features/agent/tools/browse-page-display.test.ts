import { describe, expect, it } from "vitest";

import {
  BROWSE_PAGE_UI_CONTENT_MAX_CHARS,
  formatBrowsePageOutputForDisplay,
  getBrowsePageChipLabel,
} from "./browse-page-display";
import { BROWSE_PAGE_TOOL_NAME } from "./definitions";

describe("getBrowsePageChipLabel", () => {
  it("returns null for other tools", () => {
    expect(getBrowsePageChipLabel("read_file", {}, null)).toBeNull();
  });

  it("shows the fetched URL and status code", () => {
    expect(
      getBrowsePageChipLabel(
        BROWSE_PAGE_TOOL_NAME,
        { url: "http://localhost/swagger" },
        {
          ok: true,
          tool: BROWSE_PAGE_TOOL_NAME,
          data: {
            url: "http://localhost/swagger",
            finalUrl: "http://localhost/swagger/index.html",
            content: "page",
            truncated: false,
            statusCode: 200,
          },
        }
      )
    ).toBe("browse_page: http://localhost/swagger/index.html [200]");
  });
});

describe("formatBrowsePageOutputForDisplay", () => {
  it("returns null for non browse_page output", () => {
    expect(formatBrowsePageOutputForDisplay({ ok: true, tool: "grep" })).toBeNull();
  });

  it("splits metadata and page content for display", () => {
    const formatted = formatBrowsePageOutputForDisplay({
      ok: true,
      tool: BROWSE_PAGE_TOOL_NAME,
      data: {
        url: "http://localhost/swagger",
        finalUrl: "http://localhost/swagger/index.html",
        title: "Swagger UI",
        content: "Hello Swagger",
        truncated: false,
        statusCode: 200,
        contentType: "text/html",
      },
    });

    expect(formatted).not.toBeNull();
    expect(formatted?.metadataJson).toContain('"title": "Swagger UI"');
    expect(formatted?.metadataJson).not.toContain("Hello Swagger");
    expect(formatted?.content).toBe("Hello Swagger");
    expect(formatted?.contentDisplayTruncated).toBe(false);
  });

  it("truncates very large page content for the UI preview", () => {
    const content = "x".repeat(BROWSE_PAGE_UI_CONTENT_MAX_CHARS + 100);
    const formatted = formatBrowsePageOutputForDisplay({
      ok: true,
      tool: BROWSE_PAGE_TOOL_NAME,
      data: {
        url: "http://localhost/swagger",
        finalUrl: "http://localhost/swagger",
        content,
        truncated: true,
        statusCode: 200,
      },
    });

    expect(formatted?.content).toHaveLength(BROWSE_PAGE_UI_CONTENT_MAX_CHARS);
    expect(formatted?.contentDisplayTruncated).toBe(true);
    expect(formatted?.contentTotalChars).toBe(
      BROWSE_PAGE_UI_CONTENT_MAX_CHARS + 100
    );
    expect(formatted?.fetchTruncated).toBe(true);
  });
});
