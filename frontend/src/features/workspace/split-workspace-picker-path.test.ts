import { describe, expect, it } from "vitest";

import { splitWorkspacePickerPath } from "./split-workspace-picker-path";

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
