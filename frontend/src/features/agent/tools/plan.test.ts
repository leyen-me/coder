import { describe, expect, it, vi } from "vitest";

import {
  PLAN_CREATE_TOOL_NAME,
  PLAN_LIST_TOOL_NAME,
} from "./definitions";
import { toolFailure, toolSuccess } from "./result";
import {
  planCreateHandler,
  planDeleteHandler,
  planListHandler,
  planReadHandler,
  planUpdateHandler,
} from "./plan";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => true),
  invoke: vi.fn(),
}));

vi.mock("@/features/plan/plan-events", () => ({
  emitPlanFileUpdated: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { emitPlanFileUpdated } from "@/features/plan/plan-events";

describe("plan tool handlers", () => {
  it("plan_create requires a workspace directory", async () => {
    const result = await planCreateHandler(
      { name: "auth-plan.md", content: "# Plan" },
      { workspaceDir: null }
    );
    expect(result).toEqual(
      toolFailure(
        PLAN_CREATE_TOOL_NAME,
        "workspace_required",
        "Select a workspace directory before managing plans"
      )
    );
  });

  it("plan_create validates arguments and emits update event", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      path: ".plan/refactor-auth-plan.md",
      name: "refactor-auth-plan.md",
      sha256: "abc",
      bytesWritten: 12,
      lines: 2,
    });

    const result = await planCreateHandler(
      { name: "refactor-auth-plan.md", content: "# Plan\n" },
      { workspaceDir: "/tmp/project" }
    );

    expect(result).toEqual(
      toolSuccess(PLAN_CREATE_TOOL_NAME, {
        path: ".plan/refactor-auth-plan.md",
        name: "refactor-auth-plan.md",
        sha256: "abc",
        bytesWritten: 12,
        lines: 2,
      })
    );
    expect(emitPlanFileUpdated).toHaveBeenCalledWith({
      path: ".plan/refactor-auth-plan.md",
      name: "refactor-auth-plan.md",
      action: "created",
    });
  });

  it("plan_read invokes backend with plan name", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      path: ".plan/refactor-auth-plan.md",
      name: "refactor-auth-plan.md",
      content: "# Plan",
      sha256: "abc",
      modifiedAt: 1,
    });

    const result = await planReadHandler(
      { name: "refactor-auth-plan.md" },
      { workspaceDir: "/tmp/project" }
    );

    expect(invoke).toHaveBeenCalledWith("tool_plan_read", {
      workspaceDir: "/tmp/project",
      name: "refactor-auth-plan.md",
    });
    expect(result.ok).toBe(true);
  });

  it("plan_update emits updated event", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      path: ".plan/refactor-auth-plan.md",
      name: "refactor-auth-plan.md",
      sha256: "def",
      bytesWritten: 20,
      lines: 3,
    });

    await planUpdateHandler(
      { name: "refactor-auth-plan.md", content: "# Plan\nStep 2\n" },
      { workspaceDir: "/tmp/project" }
    );

    expect(emitPlanFileUpdated).toHaveBeenCalledWith({
      path: ".plan/refactor-auth-plan.md",
      name: "refactor-auth-plan.md",
      action: "updated",
    });
  });

  it("plan_delete emits deleted event", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      path: ".plan/refactor-auth-plan.md",
      name: "refactor-auth-plan.md",
    });

    await planDeleteHandler(
      { name: "refactor-auth-plan.md" },
      { workspaceDir: "/tmp/project" }
    );

    expect(emitPlanFileUpdated).toHaveBeenCalledWith({
      path: ".plan/refactor-auth-plan.md",
      name: "refactor-auth-plan.md",
      action: "deleted",
    });
  });

  it("plan_list returns workspace plans", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      plans: [
        {
          name: "refactor-auth-plan.md",
          path: ".plan/refactor-auth-plan.md",
          modifiedAt: 100,
          bytes: 42,
        },
      ],
    });

    const result = await planListHandler({}, { workspaceDir: "/tmp/project" });
    expect(result).toEqual(
      toolSuccess(PLAN_LIST_TOOL_NAME, {
        plans: [
          {
            name: "refactor-auth-plan.md",
            path: ".plan/refactor-auth-plan.md",
            modifiedAt: 100,
            bytes: 42,
          },
        ],
      })
    );
  });
});
