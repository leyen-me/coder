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
  addMessageToolInvocation,
  completeMessageToolInvocation,
  mergeToolInvocations,
  createMessage,
  createSession,
  createTaskId,
  deleteMessagesAfter,
  deriveSessionTitle,
  getMessage,
  getMessagesBySession,
  getSession,
  setMessageStatus,
  updateMessage,
  updateSession,
  type MessageRecord,
} from "@/lib/db";
import { paths } from "@/app/paths";
import { useModelProvider } from "@/lib/model-provider/model-provider-provider";
import { useWebTools } from "@/lib/web-tools/web-tools-provider";
import type { ResolvedProviderConfig } from "@/lib/model-provider/types";

import { runAgentWithTools } from "../agent-loop";
import { buildAgentMessages } from "../build-agent-messages";
import { isAgentCancellationError } from "../cancellation";
import { SkillReferenceValidationError } from "@/features/skills/lib/skill-errors";
import { validateSkillReferencesForSend } from "@/features/skills/lib/resolve-skills";
import { extractSkillSlugsFromText } from "@/features/skills/lib/parse-skill-references";
import { mergeProcessSteps } from "../process-steps";
import { createStreamingBufferManager } from "../streaming-buffer";
import { fileUIPartsToStoredImages } from "../message-content";
import { messageRecordToAgentMessages } from "../message-history";
import type { FileUIPart } from "ai";
import { ensureSessionWorkspaceForAgent } from "../ensure-session-workspace";
import { resolveAgentEnvironment } from "../environment";
import { applyGeneratedSessionTitle } from "../generate-session-title";
import {
  resolveApiKey,
  resolveApiKeyEnvVar,
  writeLastSelectedModel,
} from "../model-preference";
import {
  DEFAULT_MODEL_CONTEXT_WINDOW,
  findModelDefinition,
} from "@/lib/model-provider/model-definition";
import { buildThinkingRequestExtensions, resolveDefaultThinkingEnabled } from "../thinking-preference";
import { cancelAgent, startAgent } from "../runner";
import type {
  AgentChatMessage,
  ActiveTaskState,
  AgentEvent,
  AgentContextUsageSnapshot,
  AgentMode,
  AgentStatus,
  SessionHandoffPhase,
  SessionHandoffState,
} from "../types";
import {
  AGENT_HANDOFF_SYSTEM_PROMPT,
  buildAgentHandoffUserPrompt,
  buildContinuationPrompt,
  buildFallbackHandoffBody,
  buildStoredHandoffArtifact,
  deriveContinuationSessionTitle,
} from "../handoff";

export type StreamingMessageOverlay = {
  content: string;
  thinking: string;
  processSteps: NonNullable<MessageRecord["processSteps"]>;
  toolInvocations: MessageRecord["toolInvocations"];
};

type AgentStoreValue = {
  activeTasks: ReadonlyMap<string, ActiveTaskState>;
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
  }) => Promise<{ userMessageId: string; assistantMessageId: string; taskId: string }>;
  regenerateMessage: (input: {
    sessionId: string;
    assistantMessageId: string;
    model: string;
    thinkingEnabled?: boolean;
    agentMode?: AgentMode;
  }) => Promise<{ userMessageId: string; assistantMessageId: string; taskId: string }>;
  cancelTask: (taskId: string) => Promise<void>;
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

function isTerminalStatus(status: AgentStatus): boolean {
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

type PendingSessionHandoff = {
  sessionId: string;
  model: string;
  userContent: string;
  thinkingEnabled: boolean;
  contextUsage: AgentContextUsageSnapshot;
};

function resolveContextWindowForModel(
  resolved: ResolvedProviderConfig,
  modelId: string
): number {
  return (
    findModelDefinition(resolved.models, modelId)?.contextWindow ??
    DEFAULT_MODEL_CONTEXT_WINDOW
  );
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
  const { resolved } = useModelProvider();
  const { tavilyConfig, settings: webToolsSettings } = useWebTools();
  const resolvedRef = useRef(resolved);
  resolvedRef.current = resolved;
  const tasksRef = useRef(new Map<string, ActiveTaskState>());
  const snapshotRef = useRef<ReadonlyMap<string, ActiveTaskState>>(new Map());
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
  const continueTaskFromHandoffRef = useRef(
    async (_input: PendingSessionHandoff) => {}
  );

  const emitStreaming = useCallback(() => {
    streamingSnapshotRef.current = streamingBufferRef.current.getSnapshot();
    for (const listener of streamingListenersRef.current) {
      listener();
    }
  }, []);

  const streamingBufferRef = useRef(
    createStreamingBufferManager({
      onFlush: async (messageId, fields) => {
        const existing = await getMessage(messageId);
        // Streaming flushes persist as a reload/crash backup only; the in-memory
        // overlay drives the live UI. Persist silently (no global re-fetch) and
        // without re-ordering the session on every token. Each event that needs a
        // UI sync (tool start/finish, status changes) issues its own non-silent
        // write right after the flush it depends on.
        await updateMessage(
          messageId,
          {
            ...fields,
            processSteps: mergeProcessSteps(
              existing?.processSteps,
              fields.processSteps
            ),
            toolInvocations: mergeToolInvocations(
              existing?.toolInvocations,
              fields.toolInvocations
            ),
          },
          { silent: true, touch: false }
        );
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
    for (const listener of listenersRef.current) {
      listener();
    }
  }, []);

  const getSnapshot = useCallback(() => snapshotRef.current, []);

  const activeTasks = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

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
          tasksRef.current.set(event.taskId, {
            ...task,
            handoff: {
              contextUsage: event.contextUsage,
            },
          });
          emit();
          return;
        }
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
          const toolInvocations = await addMessageToolInvocation(
            assistantMessageId,
            invocation
          );
          if (toolInvocations) {
            streamingBufferRef.current.setToolInvocations(
              assistantMessageId,
              toolInvocations
            );
          }
          await streamingBufferRef.current.flush(assistantMessageId);
          await setMessageStatus(assistantMessageId, "streaming");
          return;
        }
        case "tool_call_finished": {
          const toolInvocations = await completeMessageToolInvocation(
            assistantMessageId,
            event.toolCallId,
            {
              state: event.errorText ? "output-error" : "output-available",
              output: event.output,
              errorText: event.errorText,
            }
          );
          if (toolInvocations) {
            streamingBufferRef.current.setToolInvocations(
              assistantMessageId,
              toolInvocations
            );
          }
          await streamingBufferRef.current.flush(assistantMessageId);
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
          if (task) {
            tasksRef.current.set(event.taskId, {
              ...task,
              error: event.message,
            });
          }
          terminalOverlayTimersRef.current.set(
            assistantMessageId,
            setTimeout(() => {
              terminalOverlayTimersRef.current.delete(assistantMessageId);
              void (async () => {
                await streamingBufferRef.current.flush(assistantMessageId);
                await setMessageStatus(assistantMessageId, "failed", event.message);
                setTimeout(() => {
                  streamingBufferRef.current.clear(assistantMessageId);
                }, TERMINAL_OVERLAY_CLEAR_DELAY_MS);
              })();
            }, TERMINAL_STATUS_SETTLE_DELAY_MS)
          );
          emit();
          return;
        }
        case "done":
          return;
        case "status": {
          const task = tasksRef.current.get(event.taskId);
          if (!task) {
            return;
          }

          if (task.status === "cancelling" && event.status === "running") {
            emit();
            return;
          }

          tasksRef.current.set(event.taskId, {
            ...task,
            status: event.status,
            error: task.error,
          });

          if (event.status === "running") {
            await setMessageStatus(assistantMessageId, "streaming");
          }

          if (isTerminalStatus(event.status)) {
            const pendingHandoff =
              event.status === "completed" && task.handoff
                ? {
                    sessionId: task.sessionId,
                    model: task.model,
                    userContent: task.userContent,
                    thinkingEnabled: task.thinkingEnabled,
                    contextUsage: task.handoff.contextUsage,
                  }
                : null;
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
                    event.status === "completed"
                      ? "completed"
                      : event.status === "cancelled"
                        ? "cancelled"
                        : "failed";
                  await setMessageStatus(
                    assistantMessageId,
                    messageStatus,
                    task.error
                  );

                  const shouldGenerateTitle =
                    event.status === "completed" && task.isFirstTurn;
                  const titleInput = shouldGenerateTitle
                    ? {
                        sessionId: task.sessionId,
                        model: task.model,
                        userMessage: task.userContent,
                        assistantMessageId,
                      }
                    : null;

                  taskAbortControllersRef.current.delete(event.taskId);
                  tasksRef.current.delete(event.taskId);
                  if (pendingHandoff) {
                    setSessionHandoffState(
                      pendingHandoff.sessionId,
                      "generating_handoff"
                    );
                  }
                  emit();

                  setTimeout(() => {
                    streamingBufferRef.current.clear(assistantMessageId);
                  }, TERMINAL_OVERLAY_CLEAR_DELAY_MS);

                  if (titleInput) {
                    void scheduleSessionTitleGeneration(
                      titleInput,
                      resolvedRef.current
                    );
                  }

                  if (pendingHandoff) {
                    void continueTaskFromHandoffRef.current(pendingHandoff);
                  }
                })();
              }, TERMINAL_STATUS_SETTLE_DELAY_MS)
            );
          }

          emit();
        }
      }
    },
    [clearTaskChatRetry, emit, setSessionHandoffState]
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
      sessionId: string;
      model: string;
      history: AgentChatMessage[];
      workspaceDir: string | null;
      userContent: string;
      isFirstTurn: boolean;
      thinkingEnabled: boolean;
      agentMode?: AgentMode;
    }) => {
      const taskId = createTaskId();
      const assistantMessage = await createMessage({
        id: crypto.randomUUID(),
        sessionId: input.sessionId,
        role: "assistant",
        messageKind: input.agentMode === "plan" ? "plan" : undefined,
        content: "",
        thinking: "",
        processSteps: [],
        toolInvocations: [],
        status: "pending",
        taskId,
        error: null,
      });

      const activeTask: ActiveTaskState = {
        taskId,
        sessionId: input.sessionId,
        assistantMessageId: assistantMessage.id,
        status: "running",
        error: null,
        chatRetry: null,
        isFirstTurn: input.isFirstTurn,
        model: input.model,
        userContent: input.userContent,
        thinkingEnabled: input.thinkingEnabled,
        handoff: null,
        agentMode: input.agentMode ?? "agent",
      };
      tasksRef.current.set(taskId, activeTask);
      const abortController = new AbortController();
      taskAbortControllersRef.current.set(taskId, abortController);
      emit();

      void runAgentWithTools(
        {
          taskId,
          baseUrl: resolved.baseUrl,
          apiKey: resolveApiKey(resolved),
          apiKeySource: resolved.apiKeySource,
          apiKeyEnvVar: resolveApiKeyEnvVar(resolved),
          model: input.model,
          messages: input.history,
          requestExtensions: buildThinkingRequestExtensions({
            models: resolved.models,
            modelId: input.model,
            thinkingEnabled: input.thinkingEnabled,
          }),
          maxContextTokens: resolveContextWindowForModel(resolved, input.model),
          agentMode: input.agentMode,
        },
        {
          workspaceDir: input.workspaceDir,
          sessionId: input.sessionId,
          taskId,
          signal: abortController.signal,
          tavilyConfig,
          allowPrivateNetworkAccess: webToolsSettings.allowPrivateNetworkAccess,
        },
        (event) => {
          dispatchAgentEvent(taskId, assistantMessage.id, event);
        }
      ).catch((error: unknown) => {
        if (
          abortController.signal.aborted ||
          isAgentCancellationError(error)
        ) {
          dispatchAgentEvent(taskId, assistantMessage.id, {
            type: "status",
            taskId,
            status: "cancelled",
          });
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        dispatchAgentEvent(taskId, assistantMessage.id, {
          type: "error",
          taskId,
          message,
        });
        dispatchAgentEvent(taskId, assistantMessage.id, {
          type: "status",
          taskId,
          status: "failed",
        });
      });

      return {
        assistantMessageId: assistantMessage.id,
        taskId,
      };
    },
    [
      dispatchAgentEvent,
      emit,
      resolved,
      tavilyConfig,
      webToolsSettings.allowPrivateNetworkAccess,
    ]
  );

  const generateHandoffDocument = useCallback(
    async (input: {
      sessionId: string;
      model: string;
      userContent: string;
      contextUsage: AgentContextUsageSnapshot;
    }): Promise<string> => {
      const session = await getSession(input.sessionId);
      if (!session) {
        throw new Error(`Session not found: ${input.sessionId}`);
      }

      const workspaceDir = session.workspaceDir?.trim() || null;
      const environment = await resolveAgentEnvironment(workspaceDir);
      const history = await buildAgentMessages(
        (await getMessagesBySession(input.sessionId)).flatMap(
          messageRecordToAgentMessages
        ),
        environment,
        undefined,
        input.sessionId
      );

      const handoffTaskId = createTaskId();
      const handoffMessages: AgentChatMessage[] = [
        ...history,
        { role: "system", content: AGENT_HANDOFF_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildAgentHandoffUserPrompt({
            sessionTitle: session.title,
            contextUsage: input.contextUsage,
          }),
        },
      ];

      let handoffContent = "";
      let handoffError: string | null = null;

      try {
        await new Promise<void>((resolve, reject) => {
          void startAgent(
            {
              taskId: handoffTaskId,
              baseUrl: resolvedRef.current.baseUrl,
              apiKey: resolveApiKey(resolvedRef.current),
              apiKeySource: resolvedRef.current.apiKeySource,
              apiKeyEnvVar: resolveApiKeyEnvVar(resolvedRef.current),
              model: input.model,
              messages: handoffMessages,
              requestExtensions: buildThinkingRequestExtensions({
                models: resolvedRef.current.models,
                modelId: input.model,
                thinkingEnabled: false,
              }),
              maxContextTokens: resolveContextWindowForModel(
                resolvedRef.current,
                input.model
              ),
            },
            (event) => {
              if (event.type === "content_delta") {
                handoffContent += event.delta;
                return;
              }

              if (event.type === "error") {
                handoffError = event.message;
                reject(new Error(event.message));
                return;
              }

              if (event.type === "status") {
                if (event.status === "completed") {
                  resolve();
                  return;
                }

                if (event.status === "failed" || event.status === "cancelled") {
                  reject(
                    new Error(
                      handoffError ??
                        `Automatic handoff ended with status: ${event.status}`
                    )
                  );
                }
              }
            }
          ).catch(reject);
        });
      } catch {
        return buildFallbackHandoffBody({
          userContent: input.userContent,
          sourceSessionTitle: session.title,
        });
      }

      return (
        handoffContent.trim() ||
        buildFallbackHandoffBody({
          userContent: input.userContent,
          sourceSessionTitle: session.title,
        })
      );
    },
    []
  );

  const continueTaskFromHandoff = useCallback(
    async (input: PendingSessionHandoff) => {
      try {
        setSessionHandoffState(input.sessionId, "generating_handoff");
        const sourceSession = await getSession(input.sessionId);
        if (!sourceSession) {
          throw new Error(`Session not found: ${input.sessionId}`);
        }

        const handoffBody = await generateHandoffDocument({
          sessionId: input.sessionId,
          model: input.model,
          userContent: input.userContent,
          contextUsage: input.contextUsage,
        });

        setSessionHandoffState(input.sessionId, "creating_session");
        const nextSession = await createSession({
          title: deriveSessionTitle(
            deriveContinuationSessionTitle(sourceSession.title)
          ),
          model: input.model,
          workspaceDir: sourceSession.workspaceDir,
          parentSessionId: sourceSession.id,
          handoffFromSessionId: sourceSession.id,
        });

        const handoffArtifact = buildStoredHandoffArtifact({
          sourceSessionId: sourceSession.id,
          continuedSessionId: nextSession.id,
          sourceSessionTitle: sourceSession.title,
          generatedAt: new Date().toISOString(),
          model: input.model,
          contextUsage: input.contextUsage,
          handoffBody,
        });

        const handoffMessage = await createMessage({
          id: crypto.randomUUID(),
          sessionId: sourceSession.id,
          role: "assistant",
          content: handoffArtifact,
          thinking: "",
          processSteps: [],
          toolInvocations: [],
          status: "completed",
          taskId: null,
          error: null,
        });

        await updateSession(nextSession.id, {
          handoffMessageId: handoffMessage.id,
        });

        const continuationPrompt = buildContinuationPrompt({
          handoffArtifact,
          sourceSessionTitle: sourceSession.title,
        });

        const userMessage = await createMessage({
          id: crypto.randomUUID(),
          sessionId: nextSession.id,
          role: "user",
          content: continuationPrompt,
          thinking: "",
          processSteps: [],
          toolInvocations: [],
          status: "completed",
          taskId: null,
          error: null,
        });

        const workspaceDir = nextSession.workspaceDir?.trim() || null;
        const environment = await resolveAgentEnvironment(workspaceDir);
        const history = await buildAgentMessages(
          (await getMessagesBySession(nextSession.id)).flatMap(
            messageRecordToAgentMessages
          ),
          environment,
          undefined,
          nextSession.id
        );

        setSessionHandoffState(input.sessionId, "starting_new_session");
        await startAgentTask({
          sessionId: nextSession.id,
          model: input.model,
          history,
          workspaceDir,
          userContent:
            sourceSession.title.trim() || userMessage.content.trim() || "Continue",
          isFirstTurn: true,
          thinkingEnabled: input.thinkingEnabled,
        });

        clearSessionHandoffState(input.sessionId);
        navigateToSession(nextSession.id);
      } catch (error) {
        clearSessionHandoffState(input.sessionId);
        const message = error instanceof Error ? error.message : String(error);
        await createMessage({
          id: crypto.randomUUID(),
          sessionId: input.sessionId,
          role: "assistant",
          content: `Automatic handoff failed.\n\nError: ${message}`,
          thinking: "",
          processSteps: [],
          toolInvocations: [],
          status: "failed",
          taskId: null,
          error: message,
        });
      }
    },
    [
      clearSessionHandoffState,
      generateHandoffDocument,
      setSessionHandoffState,
      startAgentTask,
    ]
  );

  continueTaskFromHandoffRef.current = continueTaskFromHandoff;

  const sendMessage = useCallback(
    async (input: {
      sessionId: string;
      content: string;
      model: string;
      thinkingEnabled?: boolean;
      images?: readonly FileUIPart[];
      editMessageId?: string;
      agentMode?: AgentMode;
    }) => {
      const trimmed = input.content.trim();
      const storedImages = fileUIPartsToStoredImages(input.images ?? []);
      if (!trimmed && storedImages.length === 0) {
        throw new Error("Message content is required");
      }

      const skillValidation = await validateSkillReferencesForSend(trimmed);
      if (!skillValidation.ok) {
        throw new SkillReferenceValidationError(
          skillValidation.error,
          skillValidation.slug
        );
      }
      const referencedSkills = extractSkillSlugsFromText(trimmed);

      writeLastSelectedModel(input.model);

      for (const task of tasksRef.current.values()) {
        if (
          task.sessionId === input.sessionId &&
          isActiveAgentTask(task.status)
        ) {
          tasksRef.current.set(task.taskId, { ...task, status: "cancelling" });
          emit();
          taskAbortControllersRef.current.get(task.taskId)?.abort();
          await cancelAgent(task.taskId);
        }
      }

      let userMessage: MessageRecord;
      let isFirstTurn: boolean;

      if (input.editMessageId) {
        const sessionMessages = await getMessagesBySession(input.sessionId);
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
        const deletedMessageIds = await deleteMessagesAfter(
          input.sessionId,
          input.editMessageId
        );
        for (const messageId of deletedMessageIds) {
          streamingBufferRef.current.clear(messageId);
        }

        const updated = await updateMessage(input.editMessageId, {
          content: trimmed,
          images: storedImages.length > 0 ? storedImages : undefined,
          referencedSkills:
            referencedSkills.length > 0 ? referencedSkills : undefined,
        });
        if (!updated) {
          throw new Error(`Message not found: ${input.editMessageId}`);
        }
        userMessage = updated;
      } else {
        const existingMessages = await getMessagesBySession(input.sessionId);
        isFirstTurn = existingMessages.length === 0;
        userMessage = await createMessage({
          id: crypto.randomUUID(),
          sessionId: input.sessionId,
          role: "user",
          content: trimmed,
          images: storedImages.length > 0 ? storedImages : undefined,
          referencedSkills:
            referencedSkills.length > 0 ? referencedSkills : undefined,
          thinking: "",
          processSteps: [],
          toolInvocations: [],
          status: "completed",
          taskId: null,
          error: null,
        });
      }

      const session = await ensureSessionWorkspaceForAgent(input.sessionId);
      const workspaceDir = session.workspaceDir?.trim() || null;
      const historyMessages = await getMessagesBySession(input.sessionId);
      const environment = await resolveAgentEnvironment(workspaceDir);
      const history = await buildAgentMessages(
        historyMessages.flatMap(messageRecordToAgentMessages),
        environment,
        input.agentMode,
        input.sessionId
      );
      const thinkingEnabled = resolveThinkingEnabledForRequest(
        resolved,
        input.model,
        input.thinkingEnabled
      );
      const { assistantMessageId, taskId } = await startAgentTask({
        sessionId: input.sessionId,
        model: input.model,
        history,
        workspaceDir,
        userContent:
          trimmed ||
          storedImages[0]?.filename?.trim() ||
          "[image]",
        isFirstTurn,
        thinkingEnabled,
        agentMode: input.agentMode,
      });

      return {
        userMessageId: userMessage.id,
        assistantMessageId,
        taskId,
      };
    },
    [emit, resolved, startAgentTask]
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

      for (const task of tasksRef.current.values()) {
        if (
          task.sessionId === input.sessionId &&
          isActiveAgentTask(task.status)
        ) {
          tasksRef.current.set(task.taskId, { ...task, status: "cancelling" });
          emit();
          taskAbortControllersRef.current.get(task.taskId)?.abort();
          await cancelAgent(task.taskId);
        }
      }

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
      const deletedMessageIds = await deleteMessagesAfter(
        input.sessionId,
        userMessage.id
      );
      for (const messageId of deletedMessageIds) {
        streamingBufferRef.current.clear(messageId);
      }

      const session = await ensureSessionWorkspaceForAgent(input.sessionId);
      const workspaceDir = session.workspaceDir?.trim() || null;
      const historyMessages = await getMessagesBySession(input.sessionId);
      const environment = await resolveAgentEnvironment(workspaceDir);
      const history = await buildAgentMessages(
        historyMessages.flatMap(messageRecordToAgentMessages),
        environment,
        resolvedAgentMode,
        input.sessionId
      );
      const storedImages = userMessage.images ?? [];
      const thinkingEnabled = resolveThinkingEnabledForRequest(
        resolved,
        input.model,
        input.thinkingEnabled
      );
      const { assistantMessageId, taskId } = await startAgentTask({
        sessionId: input.sessionId,
        model: input.model,
        history,
        workspaceDir,
        userContent:
          userMessage.content.trim() ||
          storedImages[0]?.filename?.trim() ||
          "[image]",
        isFirstTurn,
        thinkingEnabled,
        agentMode: resolvedAgentMode,
      });

      return {
        userMessageId: userMessage.id,
        assistantMessageId,
        taskId,
      };
    },
    [emit, resolved, startAgentTask]
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
      isSessionRunning,
      getSessionTask,
      getSessionHandoffState,
      sendMessage,
      regenerateMessage,
      cancelTask,
    }),
    [
      activeTasks,
      cancelTask,
      getSessionHandoffState,
      getSessionTask,
      isSessionRunning,
      regenerateMessage,
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
  const { activeTasks, isSessionRunning } = useAgentStore();

  return useMemo(() => {
    const ids = new Set<string>();
    for (const task of activeTasks.values()) {
      if (isSessionRunning(task.sessionId)) {
        ids.add(task.sessionId);
      }
    }
    return ids;
  }, [activeTasks, isSessionRunning]);
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

function scheduleSessionTitleGeneration(
  input: {
    sessionId: string;
    model: string;
    userMessage: string;
    assistantMessageId: string;
  },
  provider: ResolvedProviderConfig
): void {
  void applyGeneratedSessionTitle({
    sessionId: input.sessionId,
    baseUrl: provider.baseUrl,
    apiKey: resolveApiKey(provider),
    apiKeySource: provider.apiKeySource,
    apiKeyEnvVar: provider.apiKeyEnvVar,
    model: input.model,
    userMessage: input.userMessage,
    assistantMessageId: input.assistantMessageId,
  }).catch(() => {
    // best-effort
  });
}
