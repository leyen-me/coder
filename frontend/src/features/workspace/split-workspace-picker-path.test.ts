import { describe, expect, it } from "vitest";

import {
  collapseWorkspacePickerBreadcrumb,
  splitWorkspacePickerPath,
} from "./split-workspace-picker-path";

describe("splitWorkspacePickerPath", () => {
  it("splits windows paths into breadcrumb segments", () => {
    expect(splitWorkspacePickerPath("C:/Users/demo/project")).toEqual([
      { label: "C:", path: "C:/" },
      { label: "Users", path: "C:/Users" },
      { label: "demo", path: "C:/Users/demo" },
      { label: "project", path: "C:/Users/demo/project" },
    ]);
  });

  it("splits unix paths into breadcrumb segments", () => {
    expect(splitWorkspacePickerPath("/home/demo/project")).toEqual([
      { label: "home", path: "/home" },
      { label: "demo", path: "/home/demo" },
      { label: "project", path: "/home/demo/project" },
    ]);
  });
});

describe("collapseWorkspacePickerBreadcrumb", () => {
  it("keeps short paths unchanged", () => {
    const segments = splitWorkspacePickerPath("C:/Users/demo/project");
    expect(collapseWorkspacePickerBreadcrumb(segments)).toEqual([
      { kind: "segment", label: "C:", path: "C:/" },
      { kind: "segment", label: "Users", path: "C:/Users" },
      { kind: "segment", label: "demo", path: "C:/Users/demo" },
      { kind: "segment", label: "project", path: "C:/Users/demo/project" },
    ]);
  });

  it("collapses long paths with an ellipsis", () => {
    const segments = splitWorkspacePickerPath("C:/a/b/c/d/e/f");
    expect(collapseWorkspacePickerBreadcrumb(segments)).toEqual([
      { kind: "segment", label: "C:", path: "C:/" },
      { kind: "ellipsis" },
      { kind: "segment", label: "e", path: "C:/a/b/c/d/e" },
      { kind: "segment", label: "f", path: "C:/a/b/c/d/e/f" },
    ]);
  });
});
