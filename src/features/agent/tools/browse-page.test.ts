import { describe, expect, it, vi } from "vitest";

import { BROWSE_PAGE_TOOL_NAME } from "./definitions";
import { browsePageHandler } from "./browse-page";
import { toolFailure, toolSuccess } from "./result";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => true),
  invoke: vi.fn(),
}));

import { invoke, isTauri } from "@tauri-apps/api/core";

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
    vi.mocked(invoke).mockResolvedValueOnce({
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
    expect(invoke).toHaveBeenCalledWith("tool_browse_page", {
      url: "https://example.com",
      allowPrivateNetwork: true,
    });
  });

  it("passes allowPrivateNetwork=false from context", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
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

    expect(invoke).toHaveBeenCalledWith("tool_browse_page", {
      url: "https://example.com",
      allowPrivateNetwork: false,
    });
  });

  it("returns unsupported runtime outside tauri", async () => {
    vi.mocked(isTauri).mockReturnValueOnce(false);

    const result = await browsePageHandler(
      { url: "https://example.com" },
      { workspaceDir: null }
    );

    expect(result).toEqual(
      toolFailure(
        BROWSE_PAGE_TOOL_NAME,
        "unsupported_runtime",
        "browse_page is only available in the desktop app"
      )
    );
  });
});
