"use client";

import { useSyncExternalStore } from "react";

import { AgentCancellationError } from "../cancellation";

import type {
  AskQuestionAnswer,
  AskQuestionRequest,
} from "./ask-question-shared";

export type PendingAskQuestionRequest = AskQuestionRequest & {
  taskId: string;
  sessionId: string | null;
};

type PendingEntry = {
  request: PendingAskQuestionRequest;
  resolve: (answers: AskQuestionAnswer[]) => void;
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
  signal?: AbortSignal
): Promise<AskQuestionAnswer[]> {
  const guardedSignal = signal;
  const existing = pendingEntries.get(request.taskId);
  if (existing) {
    existing.reject(
      new Error(`Task ${request.taskId} already has a pending ask_question request`)
    );
    pendingEntries.delete(request.taskId);
  }

  return new Promise<AskQuestionAnswer[]>((resolve, reject) => {
    const entry: PendingEntry = {
      request,
      resolve: (answers) => {
        if (abortCleanup) {
          guardedSignal?.removeEventListener("abort", abortCleanup);
        }
        resolve(answers);
      },
      reject: (error) => {
        if (abortCleanup) {
          guardedSignal?.removeEventListener("abort", abortCleanup);
        }
        reject(error);
      },
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

  entry.resolve(answers);
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
