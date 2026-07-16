"use client";

import { useSyncExternalStore } from "react";

import { AgentCancellationError } from "../cancellation";

import type {
  AskQuestionAnswer,
  AskQuestionRequest,
  AskQuestionResponseResult,
} from "./ask-question-shared";

export type PendingAskQuestionRequest = AskQuestionRequest & {
  taskId: string;
  sessionId: string | null;
};

type PendingEntry = {
  request: PendingAskQuestionRequest;
  resolveAnswered: (answers: AskQuestionAnswer[]) => void;
  resolveTimedOut: () => void;
  reject: (error: unknown) => void;
  abortListener?: () => void;
};

const pendingEntries = new Map<string, PendingEntry>();
const listeners = new Set<() => void>();
let snapshot: ReadonlyMap<string, PendingAskQuestionRequest> = new Map();

function rebuildSnapshot(): void {
  snapshot = new Map(
    [...pendingEntries.entries()].map(([taskId, entry]) => [taskId, entry.request])
  );
}

function emit(): void {
  rebuildSnapshot();
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ReadonlyMap<string, PendingAskQuestionRequest> {
  return snapshot;
}

function cleanup(taskId: string): PendingEntry | null {
  const entry = pendingEntries.get(taskId) ?? null;
  if (!entry) {
    return null;
  }

  pendingEntries.delete(taskId);
  emit();
  return entry;
}

export function requestAskQuestionResponse(
  request: PendingAskQuestionRequest,
  signal?: AbortSignal,
  timeoutMs?: number | null
): Promise<AskQuestionResponseResult> {
  const guardedSignal = signal;
  const existing = pendingEntries.get(request.taskId);
  if (existing) {
    existing.reject(
      new Error(`Task ${request.taskId} already has a pending ask_question request`)
    );
    pendingEntries.delete(request.taskId);
  }

  return new Promise<AskQuestionResponseResult>((resolve, reject) => {
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let settled = false;
    const clearResources = () => {
      if (abortCleanup) {
        guardedSignal?.removeEventListener("abort", abortCleanup);
      }
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
    };
    const settleResolve = (result: AskQuestionResponseResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearResources();
      resolve(result);
    };
    const settleReject = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      clearResources();
      reject(error);
    };
    const entry: PendingEntry = {
      request,
      resolveAnswered: (answers) => {
        settleResolve({
          status: "answered",
          timedOut: false,
          answers,
        });
      },
      resolveTimedOut: () => {
        settleResolve({
          status: "timeout",
          timedOut: true,
          timeoutMs: timeoutMs ?? 0,
          message:
            "User did not respond before timeout and may be away from the computer.",
          answers: [],
        });
      },
      reject: settleReject,
    };

    const abortCleanup =
      guardedSignal == null
        ? null
        : () => {
            const removed = cleanup(request.taskId);
            removed?.reject(new AgentCancellationError(request.taskId));
          };

    if (abortCleanup && guardedSignal) {
      guardedSignal.addEventListener("abort", abortCleanup, { once: true });
      entry.abortListener = abortCleanup;
    }

    if (typeof timeoutMs === "number" && timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        const removed = cleanup(request.taskId);
        removed?.resolveTimedOut();
      }, timeoutMs);
    }

    pendingEntries.set(request.taskId, entry);
    emit();
  });
}

export function submitAskQuestionResponse(
  taskId: string,
  answers: AskQuestionAnswer[]
): boolean {
  const entry = cleanup(taskId);
  if (!entry) {
    return false;
  }

  entry.resolveAnswered(answers);
  return true;
}

export function getPendingAskQuestionRequest(
  taskId: string | null | undefined
): PendingAskQuestionRequest | null {
  if (!taskId) {
    return null;
  }

  return pendingEntries.get(taskId)?.request ?? null;
}

export function usePendingAskQuestionRequest(
  taskId: string | null | undefined
): PendingAskQuestionRequest | null {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (!taskId) {
    return null;
  }

  return snapshot.get(taskId) ?? null;
}
