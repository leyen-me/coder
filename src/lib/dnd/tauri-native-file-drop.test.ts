import { describe, expect, it } from "vitest";

import {
  isPointInsideClientRect,
  physicalDropPositionToLogical,
} from "./tauri-native-file-drop";

describe("tauri-native-file-drop", () => {
  it("converts physical drop coordinates to logical pixels", () => {
    expect(physicalDropPositionToLogical({ x: 200, y: 100 }, 2)).toEqual({
      x: 100,
      y: 50,
    });
  });

  it("detects points inside a client rect", () => {
    const rect = {
      left: 10,
      top: 20,
      right: 110,
      bottom: 120,
      width: 100,
      height: 100,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    } as DOMRect;

    expect(isPointInsideClientRect(50, 50, rect)).toBe(true);
    expect(isPointInsideClientRect(5, 50, rect)).toBe(false);
  });
});
