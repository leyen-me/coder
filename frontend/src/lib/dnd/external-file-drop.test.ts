import { describe, expect, it } from "vitest";

import {
  basenameFromPath,
  collectNativeFileDropItems,
  extractAbsolutePathsFromDataTransfer,
  fileUriToPath,
  guessImageMimeType,
  hasExtractableExternalPaths,
  isImagePath,
  looksLikeAbsolutePath,
} from "./external-file-drop";

function createDataTransfer(
  init?: Partial<{
    uriList: string;
    plain: string;
    files: File[];
  }>
): DataTransfer {
  const store = new Map<string, string>();
  const files = init?.files ?? [];

  if (init?.uriList) {
    store.set("text/uri-list", init.uriList);
  }

  if (init?.plain) {
    store.set("text/plain", init.plain);
  }

  const dataTransfer = {
    dropEffect: "none",
    effectAllowed: "none",
    files,
    items: [] as unknown as DataTransferItemList,
    types: [...store.keys(), ...(files.length > 0 ? ["Files"] : [])],
    clearData: () => {},
    getData: (format: string) => store.get(format) ?? "",
    setData: () => {},
    setDragImage: () => {},
  };

  return dataTransfer as unknown as DataTransfer;
}

describe("external-file-drop", () => {
  it("parses file:// URIs from text/uri-list", () => {
    expect(
      fileUriToPath("file:///Users/test/project/src/App.tsx")
    ).toBe("/Users/test/project/src/App.tsx");
  });

  it("parses Windows file:// URIs", () => {
    expect(fileUriToPath("file:///C:/Users/test/App.tsx")).toBe(
      "C:/Users/test/App.tsx"
    );
  });

  it("extracts multiple absolute paths from uri-list", () => {
    const dataTransfer = createDataTransfer({
      uriList: [
        "file:///Users/test/a.ts",
        "# comment",
        "file:///Users/test/b.ts",
      ].join("\n"),
    });

    expect(extractAbsolutePathsFromDataTransfer(dataTransfer)).toEqual([
      "/Users/test/a.ts",
      "/Users/test/b.ts",
    ]);
    expect(hasExtractableExternalPaths(dataTransfer)).toBe(true);
  });

  it("falls back to plain absolute paths", () => {
    const dataTransfer = createDataTransfer({
      plain: "/Users/test/project/README.md",
    });

    expect(extractAbsolutePathsFromDataTransfer(dataTransfer)).toEqual([
      "/Users/test/project/README.md",
    ]);
  });

  it("detects absolute path shapes", () => {
    expect(looksLikeAbsolutePath("/Users/test/a.ts")).toBe(true);
    expect(looksLikeAbsolutePath("C:\\Users\\test\\a.ts")).toBe(true);
    expect(looksLikeAbsolutePath("src/App.tsx")).toBe(false);
  });

  it("pairs extracted paths with dropped files by index", () => {
    const file = new File(["x"], "a.ts", { type: "text/plain" });
    const dataTransfer = createDataTransfer({
      uriList: "file:///Users/test/a.ts",
      files: [file],
    });

    expect(collectNativeFileDropItems(dataTransfer)).toEqual([
      { path: "/Users/test/a.ts", file },
    ]);
  });

  it("classifies image paths by extension", () => {
    expect(isImagePath("photo.PNG")).toBe(true);
    expect(isImagePath("notes.md")).toBe(false);
  });

  it("guesses image mime types and basenames from paths", () => {
    expect(guessImageMimeType("/tmp/photo.webp")).toBe("image/webp");
    expect(basenameFromPath("/Users/test/My Photo.png")).toBe("My Photo.png");
  });
});
