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
  appendMessageDelta,
  completeMessageToolInvocation,
  createMessage,
  createTaskId,
  getMessagesBySession,
  setMessageStatus,
  type MessageRecord,
} from "@/lib/db";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { useModelProvider } from "@/lib/model-provider/model-provider-provider";
import type { ResolvedProviderConfig } from "@/lib/model-provider/types";

import { runAgentWithTools } from "../agent-loop";
import { buildAgentMessages } from "../build-agent-messages";
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
  AgentChatMessage,
  AgentEvent,
  AgentStatus,
} from "../types";

type AgentStoreValue = {
  activeTasks: ReadonlyMap<string, ActiveTaskState>;
  isSessionRunning: (sessionId: string) => boolean;
  getSessionTask: (sessionId: string) => ActiveTaskState | null;
  sendMessage: (input: {
    sessionId: string;
    content: string;
    model: string;
  }) => Promise<{ userMessageId: string; assistantMessageId: string; taskId: string }>;
  cancelTask: (taskId: string) => Promise<void>;
};

const AgentStoreContext = createContext<AgentStoreValue | null>(null);

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
  const { workspaceDir } = useWorkspace();
  const workspaceDirRef = useRef(workspaceDir);
  workspaceDirRef.current = workspaceDir;
  const resolvedRef = useRef(resolved);
  resolvedRef.current = resolved;
  const tasksRef = useRef(new Map<string, ActiveTaskState>());
  const snapshotRef = useRef<ReadonlyMap<string, ActiveTaskState>>(new Map());
  const listenersRef = useRef(new Set<() => void>());
  const eventChainsRef = useRef(new Map<string, Promise<void>>());

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

  const handleAgentEvent = useCallback(
    async (event: AgentEvent, assistantMessageId: string) => {
      switch (event.type) {
        case "thinking_delta":
          await appendMessageDelta(assistantMessageId, "thinking", event.delta);
          return;
        case "content_delta":
          await appendMessageDelta(assistantMessageId, "content", event.delta);
          return;
        case "tool_call_started":
          await addMessageToolInvocation(assistantMessageId, {
            id: event.toolCallId,
            name: event.name,
            input: event.input,
            state: "input-available",
          });
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
          const task = tasksRef.current.get(event.taskId);
          if (task) {
            tasksRef.current.set(event.taskId, {
              ...task,
              error: event.message,
            });
          }
          await setMessageStatus(assistantMessageId, "failed", event.message);
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
    }) => {
      const trimmed = input.content.trim();
      if (!trimmed) {
        throw new Error("Message content is required");
      }

      writeLastSelectedModel(input.model);

      const existingMessages = await getMessagesBySession(input.sessionId);
      const userMessage = await createMessage({
        id: crypto.randomUUID(),
        sessionId: input.sessionId,
        role: "user",
        content: trimmed,
        thinking: "",
        toolInvocations: [],
        status: "completed",
        taskId: null,
        error: null,
      });

      const taskId = createTaskId();
      const assistantMessage = await createMessage({
        id: crypto.randomUUID(),
        sessionId: input.sessionId,
        role: "assistant",
        content: "",
        thinking: "",
        toolInvocations: [],
        status: "pending",
        taskId,
        error: null,
      });

      const environment = await resolveAgentEnvironment(workspaceDirRef.current);
      const history = buildAgentMessages(
        [
          ...existingMessages.map(toAgentMessage),
          toAgentMessage(userMessage),
        ],
        environment
      );

      const activeTask: ActiveTaskState = {
        taskId,
        sessionId: input.sessionId,
        assistantMessageId: assistantMessage.id,
        status: "running",
        error: null,
        isFirstTurn: existingMessages.length === 0,
        model: input.model,
        userContent: trimmed,
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
        { workspaceDir: workspaceDirRef.current, taskId },
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
      {children}
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
    // Title generation is best-effort; keep the placeholder title on failure.
  });
}

function toAgentMessage(message: MessageRecord): AgentChatMessage {
  if (message.role === "assistant") {
    return {
      role: message.role,
      content: message.content.trim() || message.thinking.trim(),
    };
  }

  return {
    role: message.role,
    content: message.content.trim(),
  };
}
