import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  DEFAULT_SESSION_AUTONOMY_MODE,
  deriveSessionTitle,
  getMessagesBySession,
  getSession,
  updateSession,
  updateSessionTitle,
  type MessageRecord,
} from "@/lib/db";
import { notifyDbChange } from "@/lib/db/subscriptions";
import { paths } from "@/app/paths";
import { useModelProvider } from "@/lib/model-provider/model-provider-provider";
import type { ResolvedProviderConfig } from "@/lib/model-provider/types";

import { appEventBus } from "@/lib/event-bus";
import { isAgentCancellationError } from "../cancellation";
import { SkillReferenceValidationError } from "@/features/skills/lib/skill-errors";
import { resolveWorkspaceAwareSkillsBySlugs } from "@/features/skills/lib/resolve-skills";
import { createStreamingBufferManager } from "../streaming-buffer";
import { fileUIPartsToStoredImages } from "../message-content";
import type { FileUIPart } from "ai";
import type { AgentToolDefinition } from "../tools/types";
import { applyGeneratedSessionTitle } from "../generate-session-title";
import {
  resolveApiKey,
  resolveApiKeyEnvVar,
  writeLastSelectedModel,
} from "../model-preference";
import {
  findModelDefinition,
} from "@/lib/model-provider/model-definition";
import { resolveContextWindowForModel } from "../headless-runner";
import { buildThinkingRequestExtensions, resolveDefaultThinkingEnabled } from "../thinking-preference";
import {
  cancelAgent,
  getAgentSessionStatus,
  regenerateAgentMessage,
  resumeAgentStream,
  sendAgentMessage,
} from "../runner";
import type {
  ActiveTaskState,
  AgentEvent,
  AgentMode,
  AgentStatus,
  SessionHandoffPhase,
  SessionHandoffState,
} from "../types";
import { readAgentHandoffThreshold } from "../handoff-settings";
import {
  getSessionCompactUi,
  setSessionCompactUi,
} from "@/features/chat/lib/session-compact-ui-store";
import { resolveAgentSessionPolicy } from "../session-policy";

export type StreamingMessageOverlay = {
  content: string;
  thinking: string;
  processSteps: NonNullable<MessageRecord["processSteps"]>;
  toolInvocations: MessageRecord["toolInvocations"];
};

type AgentStoreValue = {
  activeTasks: ReadonlyMap<string, ActiveTaskState>;
  handoffSessionIds: ReadonlySet<string>;
  isSessionRunning: (sessionId: string) => boolean;
  getSessionTask: (sessionId: string) => ActiveTaskState | null;
  getSessionHandoffState: (sessionId: string) => SessionHandoffState | null;
  sendMessage: (input: {
    sessionId: string;
    content: string;
    model: string;
    thinkingEnabled?: boolean;
    images?: readonly FileUIPart[];
    editMessageId?: string;
    agentMode?: AgentMode;
    skillSlugs?: string[];
    extraTools?: AgentToolDefinition[];
  }) => Promise<{ userMessageId: string; assistantMessageId: string; taskId: string }>;
  regenerateMessage: (input: {
    sessionId: string;
    assistantMessageId: string;
    model: string;
    thinkingEnabled?: boolean;
    agentMode?: AgentMode;
  }) => Promise<{ userMessageId: string; assistantMessageId: string; taskId: string }>;
  cancelTask: (taskId: string) => Promise<void>;
  resumeSessionTask: (sessionId: string) => Promise<void>;
};

const AgentStoreContext = createContext<AgentStoreValue | null>(null);

const StreamingOverlaysContext = createContext<
  ReadonlyMap<string, StreamingMessageOverlay>
>(new Map());

const TERMINAL_STATUS_SETTLE_DELAY_MS = 150;
const TERMINAL_OVERLAY_CLEAR_DELAY_MS = 320;

type AgentStoreProviderProps = {
  children: ReactNode;
};

function isTerminalStatus(status: AgentStatus): status is "completed" | "failed" | "cancelled" {
  return (
    status === "completed" ||
    status === "cancelled" ||
    status === "failed"
  );
}

function isActiveAgentTask(status: AgentStatus): boolean {
  return !isTerminalStatus(status) && status !== "cancelling";
}

function resolveThinkingEnabledForRequest(
  resolved: ResolvedProviderConfig,
  modelId: string,
  thinkingEnabled?: boolean
): boolean {
  const model = findModelDefinition(resolved.models, modelId);
  return thinkingEnabled ?? resolveDefaultThinkingEnabled(model);
}

function navigateToSession(sessionId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const nextPath = paths.chat(sessionId);
  if (window.location.pathname === nextPath) {
    return;
  }

  window.history.pushState(window.history.state, "", nextPath);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function AgentStoreProvider({ children }: AgentStoreProviderProps) {
  const { resolved, resolveProviderForModel } = useModelProvider();
  const resolvedRef = useRef(resolved);
  resolvedRef.current = resolved;
  const tasksRef = useRef(new Map<string, ActiveTaskState>());
  const snapshotRef = useRef<ReadonlyMap<string, ActiveTaskState>>(new Map());
  const handoffSnapshotRef = useRef<ReadonlySet<string>>(new Set());
  const listenersRef = useRef(new Set<() => void>());
  const streamingSnapshotRef = useRef<
    ReadonlyMap<string, StreamingMessageOverlay>
  >(new Map());
  const streamingListenersRef = useRef(new Set<() => void>());
  const eventChainsRef = useRef(new Map<string, Promise<void>>());
  const taskAbortControllersRef = useRef(new Map<string, AbortController>());
  const handoffStatusesRef = useRef(new Map<string, SessionHandoffState>());
  const terminalOverlayTimersRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>()
  );

  const emitStreaming = useCallback(() => {
    streamingSnapshotRef.current = streamingBufferRef.current.getSnapshot();
    for (const listener of streamingListenersRef.current) {
      listener();
    }
  }, []);

  const streamingBufferRef = useRef(
    createStreamingBufferManager({
      onFlush: async (_messageId, _fields) => {
        // Backend agent runs are now the source of truth for persisted assistant
        // message state. The overlay remains in-memory for live rendering only.
      },
      onChange: () => {
        emitStreaming();
      },
    })
  );

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const emit = useCallback(() => {
    snapshotRef.current = new Map(tasksRef.current);
    handoffSnapshotRef.current = new Set(handoffStatusesRef.current.keys());
    for (const listener of listenersRef.current) {
      listener();
    }
  }, []);

  const getSnapshot = useCallback(() => snapshotRef.current, []);
  const getHandoffSnapshot = useCallback(() => handoffSnapshotRef.current, []);

  const activeTasks = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const handoffSessionIds = useSyncExternalStore(
    subscribe,
    getHandoffSnapshot,
    getHandoffSnapshot
  );

  const subscribeStreaming = useCallback((listener: () => void) => {
    streamingListenersRef.current.add(listener);
    return () => {
      streamingListenersRef.current.delete(listener);
    };
  }, []);

  const getStreamingSnapshot = useCallback(
    () => streamingSnapshotRef.current,
    []
  );

  const streamingOverlays = useSyncExternalStore(
    subscribeStreaming,
    getStreamingSnapshot,
    getStreamingSnapshot
  );

  const clearTaskChatRetry = useCallback(
    (taskId: string) => {
      const task = tasksRef.current.get(taskId);
      if (!task?.chatRetry) {
        return;
      }

      tasksRef.current.set(taskId, { ...task, chatRetry: null });
      emit();
    },
    [emit]
  );

  const setSessionHandoffState = useCallback(
    (sessionId: string, phase: SessionHandoffPhase) => {
      handoffStatusesRef.current.set(sessionId, { sessionId, phase });
      emit();
    },
    [emit]
  );

  const clearSessionHandoffState = useCallback(
    (sessionId: string) => {
      if (!handoffStatusesRef.current.has(sessionId)) {
        return;
      }
      handoffStatusesRef.current.delete(sessionId);
      emit();
    },
    [emit]
  );

  const handleAgentEvent = useCallback(
    async (event: AgentEvent, assistantMessageId: string) => {
      switch (event.type) {
        case "thinking_delta":
          clearTaskChatRetry(event.taskId);
          streamingBufferRef.current.append(
            assistantMessageId,
            "thinking",
            event.delta
          );
          return;
        case "content_delta":
          clearTaskChatRetry(event.taskId);
          streamingBufferRef.current.append(
            assistantMessageId,
            "content",
            event.delta
          );
          return;
        case "chat_retry": {
          const task = tasksRef.current.get(event.taskId);
          if (task) {
            tasksRef.current.set(event.taskId, {
              ...task,
              chatRetry: {
                attempt: event.attempt,
                maxAttempts: event.maxAttempts,
              },
            });
            emit();
          }
          return;
        }
        case "handoff_required": {
          const task = tasksRef.current.get(event.taskId);
          if (!task) {
            return;
          }
          const snapshot = {
            ...event.contextUsage,
            source: "handoff" as const,
            updatedAt: Date.now(),
          };
          tasksRef.current.set(event.taskId, {
            ...task,
            handoff: {
              contextUsage: event.contextUsage,
            },
          });
          await updateSession(task.sessionId, {
            contextUsageSnapshot: snapshot,
          });
          emit();
          return;
        }
        case "handoff_progress":
          setSessionHandoffState(event.sessionId, event.phase);
          notifyDbChange();
          return;
        case "compact_started": {
          const task = tasksRef.current.get(event.taskId);
          if (!task) {
            return;
          }
          const existing = getSessionCompactUi(task.sessionId);
          setSessionCompactUi(task.sessionId, {
            phase: "loading",
            boundaryBeforeMessageId: existing?.boundaryBeforeMessageId ?? null,
            i18nKey: "chat.compactInProgress",
          });
          return;
        }
        case "compact_completed": {
          const task = tasksRef.current.get(event.taskId);
          if (task) {
            window.dispatchEvent(
              new CustomEvent("coder:compact-completed", {
                detail: {
                  sessionId: task.sessionId,
                  removedCount: event.removedCount,
                  summaryPreview: event.summaryPreview,
                  firstKeptMessageId: event.firstKeptMessageId ?? null,
                  compactMessageId: event.compactMessageId ?? null,
                },
              }),
            );
          }
          notifyDbChange();
          return;
        }
        case "handoff_complete":
          clearSessionHandoffState(event.sourceSessionId);
          notifyDbChange();
          navigateToSession(event.continuedSessionId);
          return;
        case "decision_requested":
          streamingBufferRef.current.upsertProcessStep(assistantMessageId, {
            id: event.decisionId,
            kind: "decision",
            trigger: event.trigger,
            summary: event.summary,
            question: event.question,
            options: event.options,
            riskLevel: event.riskLevel,
            status: "requested",
            requiresUserConfirmation: event.requiresUserConfirmation,
            response: null,
          });
          await streamingBufferRef.current.flush(assistantMessageId);
          notifyDbChange();
          return;
        case "decision_resolved":
          streamingBufferRef.current.upsertProcessStep(assistantMessageId, {
            id: event.decisionId,
            kind: "decision",
            trigger: event.trigger,
            summary: event.summary,
            question: event.question,
            options: event.options,
            riskLevel: event.response.riskLevel,
            status: "resolved",
            requiresUserConfirmation: event.response.requiresUserConfirmation,
            response: event.response,
          });
          await streamingBufferRef.current.flush(assistantMessageId);
          return;
        case "tool_call_pending":
          streamingBufferRef.current.upsertToolInvocation(assistantMessageId, {
            id: event.toolCallId,
            name: event.name,
            input: {},
            state: "input-streaming",
          });
          streamingBufferRef.current.pushToolStep(
            assistantMessageId,
            event.toolCallId
          );
          return;
        case "tool_call_started": {
          const invocation = {
            id: event.toolCallId,
            name: event.name,
            input: event.input,
            state: "input-available" as const,
          };
          streamingBufferRef.current.upsertToolInvocation(
            assistantMessageId,
            invocation
          );
          streamingBufferRef.current.pushToolStep(
            assistantMessageId,
            event.toolCallId
          );
          await streamingBufferRef.current.flush(assistantMessageId);
          notifyDbChange();
          return;
        }
        case "tool_call_finished": {
          const existingInvocations =
            streamingBufferRef.current.get(assistantMessageId)?.toolInvocations ?? [];
          streamingBufferRef.current.setToolInvocations(
            assistantMessageId,
            existingInvocations.map((invocation) =>
              invocation.id === event.toolCallId
                ? {
                    ...invocation,
                    state: event.errorText ? "output-error" : "output-available",
                    output: event.output,
                    errorText: event.errorText,
                  }
                : invocation
            )
          );
          await streamingBufferRef.current.flush(assistantMessageId);
          notifyDbChange();
          return;
        }
        case "error": {
          streamingBufferRef.current.failPendingToolInvocations(
            assistantMessageId,
            event.message
          );
          const terminalOverlayTimer = terminalOverlayTimersRef.current.get(
            assistantMessageId
          );
          if (terminalOverlayTimer) {
            clearTimeout(terminalOverlayTimer);
            terminalOverlayTimersRef.current.delete(assistantMessageId);
          }
          const task = tasksRef.current.get(event.taskId);
          const resolvedStatus =
            task?.status === "cancelling" ? "cancelled" : "failed";
          if (task) {
            tasksRef.current.set(event.taskId, {
              ...task,
              status: resolvedStatus,
              error: event.message,
            });
          }
          terminalOverlayTimersRef.current.set(
            assistantMessageId,
            setTimeout(() => {
              terminalOverlayTimersRef.current.delete(assistantMessageId);
              void (async () => {
                await streamingBufferRef.current.flush(assistantMessageId);
                notifyDbChange();
                const latestTask = tasksRef.current.get(event.taskId);
                if (latestTask && latestTask.status === resolvedStatus) {
                  taskAbortControllersRef.current.delete(event.taskId);
                  tasksRef.current.delete(event.taskId);
                  emit();
                }
                setTimeout(() => {
                  streamingBufferRef.current.clear(assistantMessageId);
                }, TERMINAL_OVERLAY_CLEAR_DELAY_MS);
              })();
            }, TERMINAL_STATUS_SETTLE_DELAY_MS)
          );
          emit();
          return;
        }
        case "done": {
          if (event.usage) {
            notifyDbChange();
          }
          return;
        }
        case "status": {
          const task = tasksRef.current.get(event.taskId);
          if (!task) {
            return;
          }

          if (task.status === "cancelling" && event.status === "running") {
            emit();
            return;
          }

          const effectiveStatus =
            task.status === "cancelling" && event.status !== "cancelled"
              ? "cancelled"
              : event.status;

          tasksRef.current.set(event.taskId, {
            ...task,
            status: effectiveStatus,
            error: task.error,
          });

          if (effectiveStatus === "running") {
            notifyDbChange();
          }

          if (isTerminalStatus(effectiveStatus)) {
            const terminalOverlayTimer = terminalOverlayTimersRef.current.get(
              assistantMessageId
            );
            if (terminalOverlayTimer) {
              clearTimeout(terminalOverlayTimer);
            }
            terminalOverlayTimersRef.current.set(
              assistantMessageId,
              setTimeout(() => {
                terminalOverlayTimersRef.current.delete(assistantMessageId);
                void (async () => {
                  streamingBufferRef.current.finalize(assistantMessageId);
                  await streamingBufferRef.current.flush(assistantMessageId);

                  const messageStatus =
                    effectiveStatus === "completed"
                      ? "completed"
                      : effectiveStatus === "cancelled"
                        ? "cancelled"
                        : "failed";
                  void messageStatus;
                  notifyDbChange();

                  taskAbortControllersRef.current.delete(event.taskId);
                  tasksRef.current.delete(event.taskId);
                  emit();

                  setTimeout(() => {
                    streamingBufferRef.current.clear(assistantMessageId);
                  }, TERMINAL_OVERLAY_CLEAR_DELAY_MS);
                })();
              }, TERMINAL_STATUS_SETTLE_DELAY_MS)
            );

            appEventBus.emit("agent:task_completed", {
              taskId: event.taskId,
              status: effectiveStatus,
            });
          }

          emit();
        }
      }
    },
    [clearSessionHandoffState, clearTaskChatRetry, emit, setSessionHandoffState]
  );

  const dispatchAgentEvent = useCallback(
    (taskId: string, assistantMessageId: string, event: AgentEvent) => {
      const previous = eventChainsRef.current.get(taskId) ?? Promise.resolve();
      const next = previous
        .then(() => handleAgentEvent(event, assistantMessageId))
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : String(error);
          return handleAgentEvent(
            { type: "error", taskId, message },
            assistantMessageId
          );
        });

      eventChainsRef.current.set(taskId, next);

      if (event.type === "status" && isTerminalStatus(event.status)) {
        void next.finally(() => {
          eventChainsRef.current.delete(taskId);
        });
      }
    },
    [handleAgentEvent]
  );

  const startAgentTask = useCallback(
    async (input: {
      taskId: string;
      userMessageId: string;
      assistantMessageId: string;
      sessionId: string;
      model: string;
      userContent: string;
      isFirstTurn: boolean;
      thinkingEnabled: boolean;
      agentMode?: AgentMode;
      sessionKind: ActiveTaskState["sessionKind"];
      autonomyMode: ActiveTaskState["autonomyMode"];
      decisionPolicyVersion: ActiveTaskState["decisionPolicyVersion"];
      decisionModel: ActiveTaskState["decisionModel"];
    }) => {
      const activeTask: ActiveTaskState = {
        taskId: input.taskId,
        sessionId: input.sessionId,
        userMessageId: input.userMessageId,
        assistantMessageId: input.assistantMessageId,
        status: "running",
        error: null,
        chatRetry: null,
        isFirstTurn: input.isFirstTurn,
        model: input.model,
        userContent: input.userContent,
        thinkingEnabled: input.thinkingEnabled,
        handoff: null,
        agentMode: input.agentMode ?? "agent",
        sessionKind: input.sessionKind,
        autonomyMode: input.autonomyMode,
        decisionPolicyVersion: input.decisionPolicyVersion,
        decisionModel: input.decisionModel,
      };
      tasksRef.current.set(input.taskId, activeTask);
      const abortController = new AbortController();
      taskAbortControllersRef.current.set(input.taskId, abortController);
      emit();

      void resumeAgentStream(
        input.taskId,
        (event) => {
          dispatchAgentEvent(input.taskId, input.assistantMessageId, event);
        },
        { signal: abortController.signal, fromSeq: 0 },
      ).catch((error: unknown) => {
        if (
          abortController.signal.aborted ||
          isAgentCancellationError(error)
        ) {
          dispatchAgentEvent(input.taskId, input.assistantMessageId, {
            type: "status",
            taskId: input.taskId,
            status: "cancelled",
          });
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        dispatchAgentEvent(input.taskId, input.assistantMessageId, {
          type: "error",
          taskId: input.taskId,
          message,
        });
        dispatchAgentEvent(input.taskId, input.assistantMessageId, {
          type: "status",
          taskId: input.taskId,
          status: "failed",
        });
      });

      return {
        assistantMessageId: input.assistantMessageId,
        taskId: input.taskId,
      };
    },
    [
      dispatchAgentEvent,
      emit,
    ]
  );

  const resumeSessionTask = useCallback(
    async (sessionId: string) => {
      if (!sessionId) {
        return;
      }

      for (const task of tasksRef.current.values()) {
        if (task.sessionId === sessionId) {
          return;
        }
      }

      const status = await getAgentSessionStatus(sessionId);
      if (!status?.running || !status.taskId) {
        return;
      }

      const [session, messages] = await Promise.all([
        getSession(sessionId),
        getMessagesBySession(sessionId),
      ]);
      const assistantMessage = messages.find(
        (message) => message.role === "assistant" && message.taskId === status.taskId,
      );
      if (!assistantMessage) {
        return;
      }

      const latestUserMessage = [...messages]
        .reverse()
        .find((message) => message.role === "user");
      const model = session?.model ?? "";
      const activeTask: ActiveTaskState = {
        taskId: status.taskId,
        sessionId,
        userMessageId: latestUserMessage?.id ?? "",
        assistantMessageId: assistantMessage.id,
        status: (status.status as AgentStatus | undefined) ?? "running",
        error: assistantMessage.error ?? null,
        chatRetry: null,
        isFirstTurn: false,
        model,
        userContent: latestUserMessage?.content ?? "",
        thinkingEnabled: model
          ? resolveDefaultThinkingEnabled(
              findModelDefinition(resolvedRef.current.models, model)
            )
          : true,
        handoff: null,
        agentMode: assistantMessage.messageKind === "plan" ? "plan" : "agent",
        sessionKind: session?.sessionKind ?? "standard",
        autonomyMode:
          session?.autonomyMode ?? DEFAULT_SESSION_AUTONOMY_MODE,
        decisionPolicyVersion: session?.decisionPolicyVersion ?? "v1",
        decisionModel: session?.decisionModel ?? null,
      };
      if (session?.handoffPhase) {
        setSessionHandoffState(sessionId, session.handoffPhase);
      } else {
        clearSessionHandoffState(sessionId);
      }
      streamingBufferRef.current.hydrate(assistantMessage.id, {
        content: assistantMessage.content,
        thinking: assistantMessage.thinking,
        processSteps: assistantMessage.processSteps ?? [],
        toolInvocations: assistantMessage.toolInvocations ?? [],
      });
      tasksRef.current.set(status.taskId, activeTask);
      const abortController = new AbortController();
      taskAbortControllersRef.current.set(status.taskId, abortController);
      emit();

      void resumeAgentStream(
        status.taskId,
        (event) => {
          dispatchAgentEvent(status.taskId!, assistantMessage.id, event);
        },
        {
          signal: abortController.signal,
          fromSeq: status.lastSeq ?? undefined,
        },
      ).catch((error: unknown) => {
        if (
          abortController.signal.aborted ||
          isAgentCancellationError(error)
        ) {
          dispatchAgentEvent(status.taskId!, assistantMessage.id, {
            type: "status",
            taskId: status.taskId!,
            status: "cancelled",
          });
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        dispatchAgentEvent(status.taskId!, assistantMessage.id, {
          type: "error",
          taskId: status.taskId!,
          message,
        });
        dispatchAgentEvent(status.taskId!, assistantMessage.id, {
          type: "status",
          taskId: status.taskId!,
          status: "failed",
        });
      });
    },
    [clearSessionHandoffState, dispatchAgentEvent, emit, setSessionHandoffState],
  );

  const sendMessage = useCallback(
    async (input: {
      sessionId: string;
      content: string;
      model: string;
      thinkingEnabled?: boolean;
      images?: readonly FileUIPart[];
      editMessageId?: string;
      agentMode?: AgentMode;
      skillSlugs?: string[];
      extraTools?: AgentToolDefinition[];
    }) => {
      const trimmed = input.content.trim();
      const storedImages = fileUIPartsToStoredImages(input.images ?? []);
      if (!trimmed && storedImages.length === 0) {
        throw new Error("Message content is required");
      }

      // Only treat editor skillReference chips as skill references.
      // Plain-text "/xxx" stays ordinary user text for the LLM.
      const skillSlugs = input.skillSlugs ?? [];

      if (skillSlugs.length > 0) {
        const session = await getSession(input.sessionId);
        const skillValidation = await resolveWorkspaceAwareSkillsBySlugs(
          session?.workspaceDir ?? null,
          skillSlugs
        );
        if (!skillValidation.ok) {
          throw new SkillReferenceValidationError(
            skillValidation.error,
            skillValidation.slug
          );
        }
      }
      const referencedSkillsToStore =
        skillSlugs.length > 0 ? skillSlugs : undefined;

      writeLastSelectedModel(input.model);
      let isFirstTurn: boolean;
      const sessionMessages = await getMessagesBySession(input.sessionId);
      if (input.editMessageId) {
        const editIndex = sessionMessages.findIndex(
          (message) => message.id === input.editMessageId
        );
        if (editIndex === -1) {
          throw new Error(`Message not found: ${input.editMessageId}`);
        }
        const messageToEdit = sessionMessages[editIndex];
        if (messageToEdit?.role !== "user") {
          throw new Error("Only user messages can be edited");
        }
        isFirstTurn = editIndex === 0;
      } else {
        isFirstTurn = sessionMessages.length === 0;
      }

      // Set session title synchronously from user message on first turn,
      // then fire-and-forget an LLM refinement
      if (isFirstTurn) {
        const derived = deriveSessionTitle(trimmed);
        if (derived) {
          updateSessionTitle(input.sessionId, derived).catch(() => {});
        }
        const titleResolved = resolveProviderForModel(input.model) ?? resolved;
        void applyGeneratedSessionTitle({
          sessionId: input.sessionId,
          baseUrl: titleResolved.baseUrl,
          apiKey: resolveApiKey(titleResolved),
          apiKeySource: titleResolved.apiKeySource,
          apiKeyEnvVar: titleResolved.apiKeyEnvVar,
          model: input.model,
          userMessage: trimmed,
        }).catch(() => {
          // best-effort
        });
      }

      const session = await getSession(input.sessionId);
      if (!session) {
        throw new Error(`Session not found: ${input.sessionId}`);
      }
      const sessionPolicy = resolveAgentSessionPolicy(session);
      const sessionResolved = resolveProviderForModel(input.model) ?? resolved;
      const thinkingEnabled = resolveThinkingEnabledForRequest(
        sessionResolved,
        input.model,
        input.thinkingEnabled
      );
      const maxContextTokens = resolveContextWindowForModel(
        sessionResolved,
        input.model
      );
      const handoffTriggerThreshold = readAgentHandoffThreshold();
      const started = await sendAgentMessage({
        sessionId: input.sessionId,
        content: trimmed,
        images: storedImages,
        editMessageId: input.editMessageId,
        referencedSkills: referencedSkillsToStore,
        baseUrl: sessionResolved.baseUrl,
        apiKey: resolveApiKey(sessionResolved),
        apiKeySource: sessionResolved.apiKeySource,
        apiKeyEnvVar: resolveApiKeyEnvVar(sessionResolved),
        model: input.model,
        models: sessionResolved.models,
        requestExtensions: buildThinkingRequestExtensions({
          models: sessionResolved.models,
          modelId: input.model,
          thinkingEnabled,
        }),
        maxContextTokens,
        handoffTriggerThreshold,
        agentMode: input.agentMode,
        thinkingEnabled,
        extraTools: input.extraTools,
      });
      for (const messageId of started.deletedMessageIds ?? []) {
        streamingBufferRef.current.clear(messageId);
      }
      notifyDbChange();
      const { assistantMessageId, taskId } = await startAgentTask({
        taskId: started.taskId,
        userMessageId: started.userMessageId,
        assistantMessageId: started.assistantMessageId,
        sessionId: input.sessionId,
        model: input.model,
        userContent:
          trimmed ||
          storedImages[0]?.filename?.trim() ||
          "[image]",
        isFirstTurn,
        thinkingEnabled,
        agentMode: input.agentMode,
        sessionKind: sessionPolicy.sessionKind,
        autonomyMode: sessionPolicy.autonomyMode,
        decisionPolicyVersion: sessionPolicy.decisionPolicyVersion,
        decisionModel: sessionPolicy.decisionModel,
      });

      return {
        userMessageId: started.userMessageId,
        assistantMessageId,
        taskId,
      };
    },
    [emit, resolved, resolveProviderForModel, startAgentTask]
  );

  const regenerateMessage = useCallback(
    async (input: {
      sessionId: string;
      assistantMessageId: string;
      model: string;
      thinkingEnabled?: boolean;
      agentMode?: AgentMode;
    }) => {
      writeLastSelectedModel(input.model);

      const sessionMessages = await getMessagesBySession(input.sessionId);
      const assistantIndex = sessionMessages.findIndex(
        (message) => message.id === input.assistantMessageId
      );
      if (assistantIndex === -1) {
        throw new Error(`Message not found: ${input.assistantMessageId}`);
      }

      const assistantMessage = sessionMessages[assistantIndex];
      if (assistantMessage?.role !== "assistant") {
        throw new Error("Only assistant messages can be regenerated");
      }

      let userMessageIndex = -1;
      for (let index = assistantIndex - 1; index >= 0; index -= 1) {
        if (sessionMessages[index]?.role === "user") {
          userMessageIndex = index;
          break;
        }
      }
      if (userMessageIndex === -1) {
        throw new Error("No user message found before assistant message");
      }

      const userMessage = sessionMessages[userMessageIndex];
      const isFirstTurn = userMessageIndex === 0;
      const resolvedAgentMode =
        input.agentMode ??
        (assistantMessage.messageKind === "plan" ? "plan" : "agent");
      const session = await getSession(input.sessionId);
      if (!session) {
        throw new Error(`Session not found: ${input.sessionId}`);
      }
      const sessionPolicy = resolveAgentSessionPolicy(session);

      const sessionResolved = resolveProviderForModel(input.model) ?? resolved;
      const storedImages = userMessage.images ?? [];
      const thinkingEnabled = resolveThinkingEnabledForRequest(
        sessionResolved,
        input.model,
        input.thinkingEnabled
      );
      const maxContextTokens = resolveContextWindowForModel(
        sessionResolved,
        input.model
      );
      const handoffTriggerThreshold = readAgentHandoffThreshold();
      const started = await regenerateAgentMessage({
        sessionId: input.sessionId,
        assistantMessageId: input.assistantMessageId,
        baseUrl: sessionResolved.baseUrl,
        apiKey: resolveApiKey(sessionResolved),
        apiKeySource: sessionResolved.apiKeySource,
        apiKeyEnvVar: resolveApiKeyEnvVar(sessionResolved),
        model: input.model,
        models: sessionResolved.models,
        requestExtensions: buildThinkingRequestExtensions({
          models: sessionResolved.models,
          modelId: input.model,
          thinkingEnabled,
        }),
        maxContextTokens,
        handoffTriggerThreshold,
        agentMode: resolvedAgentMode,
        thinkingEnabled,
      });
      for (const messageId of started.deletedMessageIds ?? []) {
        streamingBufferRef.current.clear(messageId);
      }
      notifyDbChange();
      const { assistantMessageId, taskId } = await startAgentTask({
        taskId: started.taskId,
        userMessageId: started.userMessageId,
        assistantMessageId: started.assistantMessageId,
        sessionId: input.sessionId,
        model: input.model,
        userContent:
          userMessage.content.trim() ||
          storedImages[0]?.filename?.trim() ||
          "[image]",
        isFirstTurn,
        thinkingEnabled,
        agentMode: resolvedAgentMode,
        sessionKind: sessionPolicy.sessionKind,
        autonomyMode: sessionPolicy.autonomyMode,
        decisionPolicyVersion: sessionPolicy.decisionPolicyVersion,
        decisionModel: sessionPolicy.decisionModel,
      });

      return {
        userMessageId: started.userMessageId,
        assistantMessageId,
        taskId,
      };
    },
    [emit, resolved, resolveProviderForModel, startAgentTask]
  );

  const cancelTask = useCallback(
    async (taskId: string) => {
      const task = tasksRef.current.get(taskId);
      if (!task) {
        return;
      }

      tasksRef.current.set(taskId, { ...task, status: "cancelling" });
      emit();
      taskAbortControllersRef.current.get(taskId)?.abort();
      await cancelAgent(taskId);
    },
    [emit]
  );

  const isSessionRunning = useCallback(
    (sessionId: string) => {
      if (handoffStatusesRef.current.has(sessionId)) {
        return true;
      }
      for (const task of activeTasks.values()) {
        if (task.sessionId === sessionId && isActiveAgentTask(task.status)) {
          return true;
        }
      }
      return false;
    },
    [activeTasks]
  );

  const getSessionHandoffState = useCallback((sessionId: string) => {
    return handoffStatusesRef.current.get(sessionId) ?? null;
  }, []);

  const getSessionTask = useCallback(
    (sessionId: string) => {
      for (const task of activeTasks.values()) {
        if (task.sessionId === sessionId) {
          return task;
        }
      }
      return null;
    },
    [activeTasks]
  );

  const value = useMemo(
    () => ({
      activeTasks,
      handoffSessionIds,
      isSessionRunning,
      getSessionTask,
      getSessionHandoffState,
      sendMessage,
      regenerateMessage,
      cancelTask,
      resumeSessionTask,
    }),
    [
      activeTasks,
      handoffSessionIds,
      cancelTask,
      getSessionHandoffState,
      getSessionTask,
      isSessionRunning,
      regenerateMessage,
      resumeSessionTask,
      sendMessage,
    ]
  );

  return (
    <AgentStoreContext.Provider value={value}>
      <StreamingOverlaysContext.Provider value={streamingOverlays}>
        {children}
      </StreamingOverlaysContext.Provider>
    </AgentStoreContext.Provider>
  );
}

export function useAgentStore(): AgentStoreValue {
  const context = useContext(AgentStoreContext);
  if (!context) {
    throw new Error("useAgentStore must be used within AgentStoreProvider");
  }
  return context;
}

export function useStreamingMessageOverlays(): ReadonlyMap<
  string,
  StreamingMessageOverlay
> {
  return useContext(StreamingOverlaysContext);
}

export function useRunningSessionIds(): ReadonlySet<string> {
  const { activeTasks, handoffSessionIds } = useAgentStore();

  return useMemo(() => {
    const ids = new Set(handoffSessionIds);
    for (const task of activeTasks.values()) {
      if (isActiveAgentTask(task.status)) {
        ids.add(task.sessionId);
      }
    }
    return ids;
  }, [activeTasks, handoffSessionIds]);
}

export function useActiveStreamingMessageIds(): ReadonlySet<string> {
  const { activeTasks } = useAgentStore();

  return useMemo(() => {
    const ids = new Set<string>();
    for (const task of activeTasks.values()) {
      if (isActiveAgentTask(task.status)) {
        ids.add(task.assistantMessageId);
      }
    }
    return ids;
  }, [activeTasks]);
}

export function useChatRetryByMessageId(): ReadonlyMap<
  string,
  NonNullable<ActiveTaskState["chatRetry"]>
> {
  const { activeTasks } = useAgentStore();

  return useMemo(() => {
    const retries = new Map<string, NonNullable<ActiveTaskState["chatRetry"]>>();
    for (const task of activeTasks.values()) {
      if (isActiveAgentTask(task.status) && task.chatRetry) {
        retries.set(task.assistantMessageId, task.chatRetry);
      }
    }
    return retries;
  }, [activeTasks]);
}

