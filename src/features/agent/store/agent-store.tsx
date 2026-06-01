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
  appendMessageDelta,
  createMessage,
  createTaskId,
  getMessagesBySession,
  setMessageStatus,
  type MessageRecord,
} from "@/lib/db";
import { useModelProvider } from "@/lib/model-provider/model-provider-provider";

import {
  resolveApiKey,
  resolveApiKeyEnvVar,
  writeLastSelectedModel,
} from "../model-preference";
import { cancelAgent, startAgent } from "../runner";
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

export function AgentStoreProvider({ children }: AgentStoreProviderProps) {
  const { resolved } = useModelProvider();
  const tasksRef = useRef(new Map<string, ActiveTaskState>());
  const listenersRef = useRef(new Set<() => void>());

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const emit = useCallback(() => {
    for (const listener of listenersRef.current) {
      listener();
    }
  }, []);

  const getSnapshot = useCallback(() => tasksRef.current, []);

  const activeTasks = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const handleAgentEvent = useCallback(
    async (event: AgentEvent, assistantMessageId: string) => {
      const task = [...tasksRef.current.values()].find(
        (item) => item.taskId === event.taskId
      );
      if (!task) {
        return;
      }

      switch (event.type) {
        case "thinking_delta":
          await appendMessageDelta(assistantMessageId, "thinking", event.delta);
          break;
        case "content_delta":
          await appendMessageDelta(assistantMessageId, "content", event.delta);
          break;
        case "status": {
          const next: ActiveTaskState = {
            ...task,
            status: event.status,
          };
          tasksRef.current.set(event.taskId, next);

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
            tasksRef.current.delete(event.taskId);
          }

          emit();
          break;
        }
        case "error": {
          const next: ActiveTaskState = {
            ...task,
            error: event.message,
          };
          tasksRef.current.set(event.taskId, next);
          await setMessageStatus(assistantMessageId, "failed", event.message);
          emit();
          break;
        }
        case "done":
          break;
      }
    },
    [emit]
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
        status: "pending",
        taskId,
        error: null,
      });

      const history: AgentChatMessage[] = [
        ...existingMessages.map(toAgentMessage),
        toAgentMessage(userMessage),
      ];

      const activeTask: ActiveTaskState = {
        taskId,
        sessionId: input.sessionId,
        assistantMessageId: assistantMessage.id,
        status: "running",
        error: null,
      };
      tasksRef.current.set(taskId, activeTask);
      emit();

      void startAgent(
        {
          taskId,
          baseUrl: resolved.baseUrl,
          apiKey: resolveApiKey(resolved),
          apiKeySource: resolved.apiKeySource,
          apiKeyEnvVar: resolveApiKeyEnvVar(resolved),
          model: input.model,
          messages: history,
        },
        (event) => {
          void handleAgentEvent(event, assistantMessage.id);
        }
      );

      return {
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        taskId,
      };
    },
    [emit, handleAgentEvent, resolved]
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
        if (
          task.sessionId === sessionId &&
          !isTerminalStatus(task.status) &&
          task.status !== "cancelling"
        ) {
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

function toAgentMessage(message: MessageRecord): AgentChatMessage {
  const content = message.content.trim() || message.thinking.trim();
  return {
    role: message.role,
    content,
  };
}
