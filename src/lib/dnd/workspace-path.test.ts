import { describe, expect, it } from "vitest";

import {
  beginWorkspacePathDrag,
  endWorkspacePathDrag,
  getWorkspacePathFromDrag,
  hasWorkspacePathDrag,
  isWorkspacePathDragActive,
  setWorkspacePathDragData,
  WORKSPACE_PATH_DRAG_MIME,
} from "./workspace-path";

function createDataTransfer(): DataTransfer {
  const store = new Map<string, string>();
  const dataTransfer = {
    dropEffect: "none",
    effectAllowed: "none",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [] as string[],
    clearData: (format?: string) => {
      if (format) {
        store.delete(format);
      } else {
        store.clear();
      }
      dataTransfer.types = [...store.keys()];
    },
    getData: (format: string) => store.get(format) ?? "",
    setData: (format: string, value: string) => {
      store.set(format, value);
      dataTransfer.types = [...store.keys()];
    },
    setDragImage: () => {},
  };

  return dataTransfer as unknown as DataTransfer;
}

describe("workspace-path dnd", () => {
  it("sets workspace path and plain-text payload on drag", () => {
    const dataTransfer = createDataTransfer();
    setWorkspacePathDragData(dataTransfer, "src/App.tsx");

    expect(dataTransfer.getData(WORKSPACE_PATH_DRAG_MIME)).toBe("src/App.tsx");
    expect(dataTransfer.getData("text/plain")).toBe(
      "coder-workspace-path:src/App.tsx"
    );
    expect(dataTransfer.effectAllowed).toBe("copy");
  });

  it("detects workspace path drags from dataTransfer", () => {
    const dataTransfer = createDataTransfer();
    setWorkspacePathDragData(dataTransfer, "src/components");

    expect(hasWorkspacePathDrag(dataTransfer)).toBe(true);
    expect(getWorkspacePathFromDrag(dataTransfer)).toBe("src/components");
  });

  it("detects active workspace drag sessions during dragover", () => {
    const dataTransfer = createDataTransfer();

    beginWorkspacePathDrag("src/App.tsx");
    expect(isWorkspacePathDragActive(dataTransfer)).toBe(true);

    endWorkspacePathDrag();
    expect(isWorkspacePathDragActive(dataTransfer)).toBe(false);
  });

  it("falls back to plain-text payload on drop", () => {
    const dataTransfer = createDataTransfer();
    dataTransfer.setData("text/plain", "coder-workspace-path:src/App.tsx");

    expect(getWorkspacePathFromDrag(dataTransfer)).toBe("src/App.tsx");
  });

  it("returns null for unrelated drags", () => {
    const dataTransfer = createDataTransfer();

    expect(hasWorkspacePathDrag(dataTransfer)).toBe(false);
    expect(isWorkspacePathDragActive(dataTransfer)).toBe(false);
    expect(getWorkspacePathFromDrag(dataTransfer)).toBeNull();
  });
});
