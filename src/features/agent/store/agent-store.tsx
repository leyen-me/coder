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
  createMessage,
  createTaskId,
  deleteMessagesAfter,
  getMessage,
  getMessagesBySession,
  setMessageStatus,
  updateMessage,
  type MessageRecord,
} from "@/lib/db";
import { useModelProvider } from "@/lib/model-provider/model-provider-provider";
import type { ResolvedProviderConfig } from "@/lib/model-provider/types";

import { runAgentWithTools } from "../agent-loop";
import { buildAgentMessages } from "../build-agent-messages";
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
import { cancelAgent } from "../runner";
import type {
  ActiveTaskState,
  AgentEvent,
  AgentStatus,
} from "../types";

export type StreamingMessageOverlay = {
  content: string;
  thinking: string;
  processSteps: NonNullable<MessageRecord["processSteps"]>;
};

type AgentStoreValue = {
  activeTasks: ReadonlyMap<string, ActiveTaskState>;
  isSessionRunning: (sessionId: string) => boolean;
  getSessionTask: (sessionId: string) => ActiveTaskState | null;
  sendMessage: (input: {
    sessionId: string;
    content: string;
    model: string;
    images?: readonly FileUIPart[];
    editMessageId?: string;
  }) => Promise<{ userMessageId: string; assistantMessageId: string; taskId: string }>;
  cancelTask: (taskId: string) => Promise<void>;
};

const AgentStoreContext = createContext<AgentStoreValue | null>(null);

const StreamingOverlaysContext = createContext<
  ReadonlyMap<string, StreamingMessageOverlay>
>(new Map());

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

export function AgentStoreProvider({ children }: AgentStoreProviderProps) {
  const { resolved } = useModelProvider();
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
      onFlush: async (messageId, fields) => {
        const existing = await getMessage(messageId);
        await updateMessage(messageId, {
          ...fields,
          processSteps: mergeProcessSteps(
            existing?.processSteps,
            fields.processSteps
          ),
        });
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

  const handleAgentEvent = useCallback(
    async (event: AgentEvent, assistantMessageId: string) => {
      switch (event.type) {
        case "tool_call_started":
          await addMessageToolInvocation(assistantMessageId, {
            id: event.toolCallId,
            name: event.name,
            input: event.input,
            state: "input-available",
          });
          streamingBufferRef.current.pushToolStep(
            assistantMessageId,
            event.toolCallId
          );
          await streamingBufferRef.current.flush(assistantMessageId);
          await setMessageStatus(assistantMessageId, "streaming");
          return;
        case "tool_call_finished":
          await completeMessageToolInvocation(assistantMessageId, event.toolCallId, {
            state: event.errorText ? "output-error" : "output-available",
            output: event.output,
            errorText: event.errorText,
          });
          return;
        case "error": {
          await streamingBufferRef.current.flush(assistantMessageId);
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
          await setMessageStatus(assistantMessageId, "failed", event.message);
          streamingBufferRef.current.clear(assistantMessageId);
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

          tasksRef.current.set(event.taskId, {
            ...task,
            status: event.status,
            error: task.error,
          });

          if (event.status === "running") {
            await setMessageStatus(assistantMessageId, "streaming");
          }

          if (isTerminalStatus(event.status)) {
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

            tasksRef.current.delete(event.taskId);

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
                streamingBufferRef.current.clear(assistantMessageId);
              }, TERMINAL_OVERLAY_CLEAR_DELAY_MS)
            );

            if (titleInput) {
              void scheduleSessionTitleGeneration(
                titleInput,
                resolvedRef.current
              );
            }
          }

          emit();
        }
      }
    },
    [emit]
  );

  const dispatchAgentEvent = useCallback(
    (taskId: string, assistantMessageId: string, event: AgentEvent) => {
      if (event.type === "thinking_delta") {
        streamingBufferRef.current.append(
          assistantMessageId,
          "thinking",
          event.delta
        );
        return;
      }

      if (event.type === "content_delta") {
        streamingBufferRef.current.append(
          assistantMessageId,
          "content",
          event.delta
        );
        return;
      }

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

  const sendMessage = useCallback(
    async (input: {
      sessionId: string;
      content: string;
      model: string;
      images?: readonly FileUIPart[];
      editMessageId?: string;
    }) => {
      const trimmed = input.content.trim();
      const storedImages = fileUIPartsToStoredImages(input.images ?? []);
      if (!trimmed && storedImages.length === 0) {
        throw new Error("Message content is required");
      }

      writeLastSelectedModel(input.model);

      for (const task of tasksRef.current.values()) {
        if (
          task.sessionId === input.sessionId &&
          isActiveAgentTask(task.status)
        ) {
          tasksRef.current.set(task.taskId, { ...task, status: "cancelling" });
          emit();
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
          thinking: "",
          processSteps: [],
          toolInvocations: [],
          status: "completed",
          taskId: null,
          error: null,
        });
      }

      const taskId = createTaskId();

      const session = await ensureSessionWorkspaceForAgent(input.sessionId);
      const workspaceDir = session.workspaceDir?.trim() || null;
      const historyMessages = await getMessagesBySession(input.sessionId);
      const environment = await resolveAgentEnvironment(workspaceDir);
      const history = buildAgentMessages(
        historyMessages.flatMap(messageRecordToAgentMessages),
        environment
      );

      const assistantMessage = await createMessage({
        id: crypto.randomUUID(),
        sessionId: input.sessionId,
        role: "assistant",
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
        isFirstTurn,
        model: input.model,
        userContent:
          trimmed ||
          storedImages[0]?.filename?.trim() ||
          "[image]",
      };
      tasksRef.current.set(taskId, activeTask);
      emit();

      void runAgentWithTools(
        {
          taskId,
          baseUrl: resolved.baseUrl,
          apiKey: resolveApiKey(resolved),
          apiKeySource: resolved.apiKeySource,
          apiKeyEnvVar: resolveApiKeyEnvVar(resolved),
          model: input.model,
          messages: history,
        },
        { workspaceDir, taskId },
        (event) => {
          dispatchAgentEvent(taskId, assistantMessage.id, event);
        }
      ).catch((error: unknown) => {
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
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        taskId,
      };
    },
    [dispatchAgentEvent, emit, resolved]
  );

  const cancelTask = useCallback(
    async (taskId: string) => {
      const task = tasksRef.current.get(taskId);
      if (!task) {
        return;
      }

      tasksRef.current.set(taskId, { ...task, status: "cancelling" });
      emit();
      await cancelAgent(taskId);
    },
    [emit]
  );

  const isSessionRunning = useCallback(
    (sessionId: string) => {
      for (const task of activeTasks.values()) {
        if (task.sessionId === sessionId && isActiveAgentTask(task.status)) {
          return true;
        }
      }
      return false;
    },
    [activeTasks]
  );

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
      sendMessage,
      cancelTask,
    }),
    [activeTasks, cancelTask, getSessionTask, isSessionRunning, sendMessage]
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
  const { activeTasks } = useAgentStore();

  return useMemo(() => {
    const ids = new Set<string>();
    for (const task of activeTasks.values()) {
      if (isActiveAgentTask(task.status)) {
        ids.add(task.sessionId);
      }
    }
    return ids;
  }, [activeTasks]);
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
