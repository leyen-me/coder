import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
  apiPost: vi.fn(),
}));

import { apiPost } from "@/lib/api/client";
import { BROWSE_PAGE_TOOL_NAME } from "./definitions";
import { browsePageHandler } from "./browse-page";
import { toolFailure, toolSuccess } from "./result";


describe("browsePageHandler", () => {
  it("requires url in arguments", async () => {
    const result = await browsePageHandler({}, { workspaceDir: null });
    expect(result).toEqual(
      toolFailure(
        BROWSE_PAGE_TOOL_NAME,
        "invalid_arguments",
        "url is required and must be a non-empty string"
      )
    );
  });

  it("returns successful page content", async () => {
    vi.mocked(apiPost).mockResolvedValueOnce({
      url: "https://example.com",
      finalUrl: "https://example.com/",
      title: "Example Domain",
      content: "Example Domain\nThis domain is for use in documentation examples.",
      truncated: false,
      statusCode: 200,
      contentType: "text/html",
    });

    const result = await browsePageHandler(
      { url: "https://example.com" },
      { workspaceDir: null }
    );

    expect(result).toEqual(
      toolSuccess(BROWSE_PAGE_TOOL_NAME, {
        url: "https://example.com",
        finalUrl: "https://example.com/",
        title: "Example Domain",
        content: "Example Domain\nThis domain is for use in documentation examples.",
        truncated: false,
        statusCode: 200,
        contentType: "text/html",
      })
    );
    expect(apiPost).toHaveBeenCalledWith("/api/tool_browse_page", {
      url: "https://example.com",
      startLine: null,
      maxLines: null,
      allowPrivateNetwork: true,
    });
  });

  it("passes allowPrivateNetwork=false from context", async () => {
    vi.mocked(apiPost).mockResolvedValueOnce({
      url: "https://example.com",
      finalUrl: "https://example.com/",
      content: "ok",
      truncated: false,
      statusCode: 200,
    });

    await browsePageHandler(
      { url: "https://example.com" },
      { workspaceDir: null, allowPrivateNetworkAccess: false }
    );

    expect(apiPost).toHaveBeenCalledWith("/api/tool_browse_page", {
      url: "https://example.com",
      startLine: null,
      maxLines: null,
      allowPrivateNetwork: false,
    });
  });

});
