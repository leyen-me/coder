import { describe, expect, it } from "vitest";

import {
  removeQueuedMessage,
  takeNextQueuedMessage,
  updateQueuedMessage,
  type QueuedMessage,
} from "./message-queue";

const baseQueue: QueuedMessage[] = [
  {
    id: "queued-1",
    text: "先解释一下当前架构。",
    files: [],
  },
  {
    id: "queued-2",
    text: "然后补一个测试。",
    files: [
      {
        type: "file",
        url: "data:image/png;base64,abc",
        mediaType: "image/png",
        filename: "screenshot.png",
      },
    ],
  },
];

describe("message queue helpers", () => {
  it("updates only the targeted queued message", () => {
    const nextQueue = updateQueuedMessage(baseQueue, "queued-2", {
      text: "然后补两个测试。",
      files: [],
    });

    expect(nextQueue).toEqual([
      baseQueue[0],
      {
        id: "queued-2",
        text: "然后补两个测试。",
        files: [],
      },
    ]);
  });

  it("removes a queued message by id", () => {
    expect(removeQueuedMessage(baseQueue, "queued-1")).toEqual([baseQueue[1]]);
  });

  it("returns the next queued message and remaining items", () => {
    expect(takeNextQueuedMessage(baseQueue)).toEqual({
      message: baseQueue[0],
      remaining: [baseQueue[1]],
    });
  });

  it("returns an empty dequeue result for an empty queue", () => {
    expect(takeNextQueuedMessage([])).toEqual({
      message: null,
      remaining: [],
    });
  });
});
