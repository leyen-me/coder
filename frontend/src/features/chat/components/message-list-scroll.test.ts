import { describe, expect, it } from "vitest";

import {
  getDistanceFromBottom,
  isNearBottom,
  shouldClearScrollPinSuppression,
  shouldFollowStream,
} from "./message-list-scroll";

function createViewport({
  scrollHeight,
  scrollTop,
  clientHeight,
}: {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}): HTMLElement {
  return {
    scrollHeight,
    scrollTop,
    clientHeight,
  } as HTMLElement;
}

describe("message-list-scroll", () => {
  it("computes distance from bottom", () => {
    const viewport = createViewport({
      scrollHeight: 1000,
      scrollTop: 700,
      clientHeight: 200,
    });

    expect(getDistanceFromBottom(viewport)).toBe(100);
  });

  it("treats the viewport as near bottom within the threshold", () => {
    const viewport = createViewport({
      scrollHeight: 1000,
      scrollTop: 760,
      clientHeight: 200,
    });

    expect(isNearBottom(viewport, 80)).toBe(true);
  });

  it("does not follow the stream when the user has scrolled away", () => {
    expect(
      shouldFollowStream({
        isPinnedToBottom: false,
        userJustSent: false,
      })
    ).toBe(false);
  });

  it("follows the stream after the user sends a message", () => {
    expect(
      shouldFollowStream({
        isPinnedToBottom: false,
        userJustSent: true,
      })
    ).toBe(true);
  });

  it("clears scroll pin suppression once the viewport reaches the bottom", () => {
    expect(shouldClearScrollPinSuppression(80, 80)).toBe(true);
    expect(shouldClearScrollPinSuppression(81, 80)).toBe(false);
  });
});
