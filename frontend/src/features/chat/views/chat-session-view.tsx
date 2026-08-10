import type { AgentMode } from "@/features/agent/types";
import type { FileUIPart } from "ai";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { nanoid } from "nanoid";
import { toast } from "sonner";

import { storedImagesToFileUIParts } from "@/features/agent/message-content";
import { resolveDefaultModelValue } from "@/features/agent/model-preference";
import {
  isModelValue,
  makeModelValue,
  parseModelValue,
} from "@/lib/model-provider/resolve-provider-config";
import { useAgentStore } from "@/features/agent/store/agent-store";
import { getWorkspaceDisplayName } from "@/features/workspace/storage";
import { apiPost } from "@/lib/api/client";
import { useModelProvider } from "@/lib/model-provider/model-provider-provider";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { paths } from "@/app/paths";

import { ChatHotkeyActions } from "@/features/keyboard-shortcuts/chat-hotkey-actions";

import { AgentStopConfirmBanner } from "../components/agent-stop-confirm-banner";
import { AgentTodoList } from "../components/agent-todo-list";
import { PlanSheet } from "../components/plan-sheet";
import { useAgentStopConfirmation } from "../hooks/use-agent-stop-confirmation";
import { ChatMessageList } from "../components/chat-message-list";
import { requestMessageListScrollToBottom } from "../components/message-list-scroll";
import { PromptComposer } from "../components/prompt-composer";
import { SubAgentInfoBar } from "../components/sub-agent-info-bar";
import { QueuedMessageList } from "../components/queued-message-list";
import { notifySendMessageError } from "../lib/notify-send-message-error";
import { buildPlanExecutionPrompt } from "../lib/plan/build-plan-execution-prompt";
import { resolvePlanContentForBuild } from "../lib/plan/resolve-plan-content";
import {
  removeQueuedMessage,
  takeNextQueuedMessage,
  updateQueuedMessage,
  type QueuedMessage,
} from "../lib/message-queue";
import { useComposerThinking } from "../hooks/use-composer-thinking";
import {
  estimateSessionContextUsage,
} from "../lib/estimate-session-context-usage";
import {
  useDisplayMessages,
  useSessionData,
} from "../hooks/use-session-messages";
import {
  compactUiFromAgentCompleted,
  compactUiFromApiResponse,
  type CompactApiResponse,
} from "../lib/compact-response";
import { estimateCompactEventAfterMessageId } from "../lib/estimate-compact-anchor";
import {
  setSessionCompactUi,
  useSessionCompactUi,
} from "../lib/session-compact-ui-store";
import { useSessionWorkspaceBinding } from "../hooks/use-session-workspace-binding";
import { useSystemPrompt } from "../hooks/use-system-prompt";
import { useWorkspaceGitControls } from "../hooks/use-workspace-git-controls";
import type { McpServerConfig, MessageRecord } from "@/lib/db";
import { updateSession } from "@/lib/db/sessions";
import { listMcpServers } from "@/lib/db/mcp-servers";
import { updateSessionMcpServers } from "@/features/mcp/api";

type ChatSessionViewProps = {
  chatId: string;
  /**
   * Read-only mode (used by the right-hand SubAgent panel): hides the composer
   * and all message editing/regeneration controls, and renders a live info bar
   * instead. The user can watch the session run but cannot send a new prompt.
   */
  readOnly?: boolean;
};

export function ChatSessionView({ chatId, readOnly = false }: ChatSessionViewProps) {
  const { t } = useTranslation();
  const { allModels, modelEntries, getProviderLabel } = useModelProvider();
  const {
    sendMessage,
    regenerateMessage,
    cancelTask,
    getSessionTask,
    isSessionRunning,
    resumeSessionTask,
  } = useAgentStore();
  const location = useLocation();
  const navigate = useNavigate();
  const { session, messages, isLoading, refresh } = useSessionData(chatId);
  const displayMessages = useDisplayMessages(messages);
  const displayMessagesRef = useRef(displayMessages);
  displayMessagesRef.current = displayMessages;
  const compactUi = useSessionCompactUi(chatId);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingQueuedMessageId, setEditingQueuedMessageId] = useState<string | null>(
    null
  );
  const [editInitialFiles, setEditInitialFiles] = useState<FileUIPart[]>([]);
  const [editInitialValue, setEditInitialValue] = useState("");
  const [editInitialReferencedSkills, setEditInitialReferencedSkills] = useState<
    readonly string[] | undefined
  >(undefined);
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
  const queueDispatchingRef = useRef(false);

  // On-demand MCP attachment for this session.
  const [enabledMcpServers, setEnabledMcpServers] = useState<McpServerConfig[]>([]);
  const [attachedMcpServers, setAttachedMcpServers] = useState<string[]>([]);

  // Load the enabled MCP servers available to attach (the "+" menu lists these).
  useEffect(() => {
    let cancelled = false;
    void listMcpServers()
      .then((servers) => {
        if (!cancelled) {
          setEnabledMcpServers(servers.filter((server) => server.enabled));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Seed the attached set from the session record (source of truth = backend)
  // exactly once, when the session first loads for this chat. After that the
  // toggle owns `attachedMcpServers` — we must NOT re-seed on every
  // `useSessionData` refresh, or a refresh that reads the backend value back as
  // empty would clobber the user's optimistic selection (and then the next send
  // would persist the empty list, wiping the attachment).
  const seededChatIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!session) {
      return;
    }
    if (seededChatIdRef.current === chatId) {
      return;
    }
    seededChatIdRef.current = chatId;
    setAttachedMcpServers(session.attachedMcpServers ?? []);
  }, [chatId, session]);

  const handleToggleMcpServer = useCallback(
    async (serverId: string) => {
      const next = attachedMcpServers.includes(serverId)
        ? attachedMcpServers.filter((id) => id !== serverId)
        : [...attachedMcpServers, serverId];
      setAttachedMcpServers(next);
      try {
        await updateSessionMcpServers(chatId, next);
        await updateSession(chatId, { attachedMcpServers: next });
      } catch {
        // Revert optimistic update on failure so UI stays consistent.
        setAttachedMcpServers(attachedMcpServers);
      }
    },
    [attachedMcpServers, chatId]
  );
  const [model, setModel] = useState(() => resolveDefaultModelValue(modelEntries));
  const handleModelChange = useCallback(
    (next: string) => {
      setModel(next);
      if (chatId) {
        void updateSession(chatId, {
          model: next,
          provider: parseModelValue(next).providerId,
        });
      }
    },
    [chatId]
  );
  const { thinkingEnabled, onThinkingEnabledChange } = useComposerThinking(
    model,
    allModels
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBuildPending, setIsBuildPending] = useState(false);
  type ChatLocationState = {
    agentMode?: AgentMode;
    hideWorkspaceControls?: boolean;
  } | null;
  const locationState = location.state as ChatLocationState;
  const initialAgentModeFromState = locationState?.agentMode ?? "agent";
  const [agentMode, setAgentMode] = useState<AgentMode>(initialAgentModeFromState);
  const [workspaceBarDismissed, setWorkspaceBarDismissed] = useState(
    () => locationState?.hideWorkspaceControls ?? false
  );

  useEffect(() => {
    const hideFromNavigation = locationState?.hideWorkspaceControls ?? false;
    setWorkspaceBarDismissed(hideFromNavigation);
  }, [chatId, locationState?.hideWorkspaceControls]);

  const canEditWorkspace =
    messages.length === 0 &&
    !workspaceBarDismissed &&
    !isSessionRunning(chatId);
  const workspaceBinding = useSessionWorkspaceBinding({
    session,
    canEdit: canEditWorkspace,
  });
  const gitControls = useWorkspaceGitControls({
    workspaceDir: workspaceBinding.workspaceDir,
    enabled: canEditWorkspace,
  });
  const { systemPrompt, refreshSystemPrompt } = useSystemPrompt(
    workspaceBinding.workspaceDir,
    chatId,
    agentMode
  );

  const activeTask = getSessionTask(chatId);
  const isRunning = isSessionRunning(chatId) || isSubmitting || isBuildPending;
  const deferredContextMessages = useDeferredValue(
    activeTask ? messages : displayMessages
  );

  useEffect(() => {
    if (session?.model) {
      // Reconstruct the composite selection value so the exact provider is
      // restored (a plain model id alone can't disambiguate duplicate ids).
      setModel(
        isModelValue(session.model)
          ? session.model
          : session.provider
            ? makeModelValue(session.provider, session.model)
            : session.model
      );
    }
  }, [session?.model, session?.provider]);

  useEffect(() => {
    let cancelled = false;
    void resumeSessionTask(chatId).finally(() => {
      if (!cancelled) {
        void refresh();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [chatId, refresh, resumeSessionTask]);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditingQueuedMessageId(null);
    setEditInitialFiles([]);
    setEditInitialValue("");
    setEditInitialReferencedSkills(undefined);
  }, []);

  const handleEditUserMessage = useCallback(
    (message: MessageRecord) => {
      const task = getSessionTask(chatId);
      if (task) {
        void cancelTask(task.taskId);
      }

      setEditingQueuedMessageId(null);
      setEditingMessageId(message.id);
      setEditInitialValue(message.content);
      setEditInitialFiles(storedImagesToFileUIParts(message.images ?? []));
      setEditInitialReferencedSkills(message.referencedSkills);
    },
    [cancelTask, chatId, getSessionTask]
  );

  const sendPayload = useCallback(
    async (
      payload: { text: string; files: FileUIPart[]; skillSlugs?: string[] },
      options?: {
        editMessageId?: string;
        requeueOnError?: QueuedMessage | null;
      }
    ): Promise<void> => {
      const trimmed = payload.text.trim();
      const hasImages = payload.files.length > 0;
      if (!trimmed && !hasImages) {
        return;
      }

      setIsSubmitting(true);
      try {
        await sendMessage({
          sessionId: chatId,
          content: trimmed,
          images: payload.files,
          model,
          thinkingEnabled,
          editMessageId: options?.editMessageId,
          agentMode,
          skillSlugs: payload.skillSlugs,
        });
        requestMessageListScrollToBottom();
      } catch (error) {
        notifySendMessageError(error, (key, params) =>
          t(`chat.${key}`, params)
        );

        if (!options?.editMessageId) {
          setWorkspaceBarDismissed(false);
        }

        if (options?.requeueOnError) {
          setQueuedMessages((currentQueue) => [
            options.requeueOnError as QueuedMessage,
            ...currentQueue,
          ]);
        }

        // Re-throw so the caller (PromptComposer) can restore the input value
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [agentMode, chatId, model, sendMessage, t, thinkingEnabled]
  );

  const handleRegenerateAssistantMessage = useCallback(
    async (message: MessageRecord) => {
      if (isRunning) {
        return;
      }

      const task = getSessionTask(chatId);
      if (task) {
        await cancelTask(task.taskId);
      }

      await regenerateMessage({
        sessionId: chatId,
        assistantMessageId: message.id,
        model,
        thinkingEnabled,
        agentMode:
          message.messageKind === "plan"
            ? "plan"
            : agentMode,
      });
    },
    [agentMode, cancelTask, chatId, getSessionTask, isRunning, model, regenerateMessage, thinkingEnabled]
  );

  const handleBuildFromPlan = useCallback(
    async (planContent: string) => {
      if (isRunning) {
        return;
      }

      const isFirstMessage = messages.length === 0;
      if (isFirstMessage) {
        setWorkspaceBarDismissed(true);
      }

      setIsBuildPending(true);
      setAgentMode("agent");
      try {
        const resolved = await resolvePlanContentForBuild(
          workspaceBinding.workspaceDir,
          planContent,
          session?.planFileName ?? null
        );
        await sendMessage({
          sessionId: chatId,
          content: buildPlanExecutionPrompt(resolved.content, resolved.path),
          model,
          thinkingEnabled,
          agentMode: "agent",
          skillSlugs: [],
        });

        // Mark the plan as built so it cannot be re-executed
        await updateSession(chatId, { planBuiltAt: Date.now() });
      } catch (error) {
        notifySendMessageError(error, (key, params) =>
          t(`chat.${key}`, params)
        );
        if (isFirstMessage) {
          setWorkspaceBarDismissed(false);
        }
      } finally {
        setIsBuildPending(false);
      }
    },
    [
      chatId,
      messages.length,
      session?.planFileName,
      isRunning,
      model,
      sendMessage,
      t,
      thinkingEnabled,
      workspaceBinding.workspaceDir,
    ]
  );

  const handleSend = useCallback(
    async (payload: { text: string; files: FileUIPart[]; skillSlugs?: string[] }): Promise<void> => {
      const trimmed = payload.text.trim();
      const hasImages = payload.files.length > 0;
      if (!trimmed && !hasImages) {
        return;
      }

      if (editingQueuedMessageId) {
        setQueuedMessages((currentQueue) =>
          updateQueuedMessage(currentQueue, editingQueuedMessageId, {
            text: trimmed,
            files: payload.files,
            skillSlugs: payload.skillSlugs,
          })
        );
        setEditingQueuedMessageId(null);
        setEditInitialFiles([]);
        setEditInitialValue("");
        return;
      }

      const isFirstMessage = messages.length === 0 && !editingMessageId;
      if (isFirstMessage) {
        setWorkspaceBarDismissed(true);
      }

      if (isRunning && !editingMessageId) {
        setQueuedMessages((currentQueue) => [
          ...currentQueue,
          {
            id: nanoid(),
            text: trimmed,
            files: payload.files,
            skillSlugs: payload.skillSlugs,
          },
        ]);
        setEditInitialFiles([]);
        return;
      }

      const editingId = editingMessageId;
      setEditingMessageId(null);
      setEditInitialFiles([]);
      setEditInitialValue("");
      await sendPayload(
        {
          text: trimmed,
          files: payload.files,
          skillSlugs: payload.skillSlugs,
        },
        {
          editMessageId: editingId ?? undefined,
        }
      );
    },
    [
      editingMessageId,
      editingQueuedMessageId,
      messages.length,
      isRunning,
      sendPayload,
    ]
  );

  const handleEditQueuedMessage = useCallback((message: QueuedMessage) => {
    setEditingMessageId(null);
    setEditingQueuedMessageId(message.id);
    setEditInitialValue(message.text);
    setEditInitialFiles(message.files);
    setEditInitialReferencedSkills(message.skillSlugs);
  }, []);

  const handleDeleteQueuedMessage = useCallback((messageId: string) => {
    setQueuedMessages((currentQueue) => removeQueuedMessage(currentQueue, messageId));
    if (editingQueuedMessageId === messageId) {
      setEditingQueuedMessageId(null);
      setEditInitialFiles([]);
      setEditInitialValue("");
    }
  }, [editingQueuedMessageId]);

  useEffect(() => {
    if (isRunning || editingQueuedMessageId || queueDispatchingRef.current) {
      return;
    }

    const nextItem = queuedMessages[0];
    if (!nextItem) {
      return;
    }

    queueDispatchingRef.current = true;
    setQueuedMessages((currentQueue) => takeNextQueuedMessage(currentQueue).remaining);

    void sendPayload(
      {
        text: nextItem.text,
        files: nextItem.files,
        skillSlugs: nextItem.skillSlugs,
      },
      {
        requeueOnError: nextItem,
      }
    ).catch(() => {
      // Re-queue failed message. PromptComposer will handle value restoration
      // via the try/catch in handleSubmit.
      setEditingQueuedMessageId(nextItem.id);
      setEditInitialFiles(nextItem.files);
      setEditInitialValue(nextItem.text);
    }).finally(() => {
      queueDispatchingRef.current = false;
    });
  }, [editingQueuedMessageId, isRunning, queuedMessages, sendPayload]);

  const handleStop = () => {
    if (activeTask) {
      void cancelTask(activeTask.taskId);
    }
  };

  const {
    isPending: isStopConfirmPending,
    requestStop: requestStopAgent,
    confirmStop: confirmStopAgent,
    dismissStopConfirm,
  } = useAgentStopConfirmation(handleStop);

  useEffect(() => {
    if (!activeTask) {
      dismissStopConfirm();
    }
  }, [activeTask, dismissStopConfirm]);

  const workspaceName = workspaceBinding.workspaceDir
    ? getWorkspaceDisplayName(workspaceBinding.workspaceDir)
    : null;
  const contextUsage = useMemo(
    () => {
      return estimateSessionContextUsage({
        messages: deferredContextMessages,
        systemPrompt,
        modelId: model,
        models: allModels,
        editingMessageId,
        contextUsageSnapshot: session?.contextUsageSnapshot,
      });
    },
    [
      deferredContextMessages,
      editingMessageId,
      session?.contextUsageSnapshot,
      model,
      allModels,
      systemPrompt,
    ]
  );

  // ── Compact command handler ──────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      if (isRunning) {
        toast.error(t("chat.compactBlockedWhileRunning"));
        return;
      }

      const currentMessages = displayMessagesRef.current;
      const boundaryAfterMessageId =
        estimateCompactEventAfterMessageId(currentMessages);
      setSessionCompactUi(chatId, {
        phase: "loading",
        boundaryAfterMessageId,
        i18nKey: "chat.compactInProgress",
      });

      void apiPost<CompactApiResponse>("/api/compact", {
        sessionId: chatId,
        taskId: activeTask?.taskId,
        force: import.meta.env.DEV,
      })
        .then(async (result) => {
          if (result.code === "agent_running") {
            setSessionCompactUi(chatId, null);
            toast.error(t("chat.compactBlockedWhileRunning"));
            return;
          }

          if (result.code === "compacted") {
            await refresh();
          }

          setSessionCompactUi(
            chatId,
            compactUiFromApiResponse(displayMessagesRef.current, result),
          );
        })
        .catch(() => {
          setSessionCompactUi(chatId, {
            phase: "error",
            boundaryAfterMessageId,
            i18nKey: "chat.compactFailed",
          });
        });
    };

    window.addEventListener("coder:command-compact", handler);
    return () => window.removeEventListener("coder:command-compact", handler);
  }, [activeTask?.taskId, chatId, isRunning, refresh, t]);

  // Only scroll while compact is pending — the spinner sits after the latest
  // message, so users need to see the bottom. Success/noop/error stay in place.
  useEffect(() => {
    if (!compactUi) {
      return;
    }
    if (compactUi.phase !== "loading" && compactUi.phase !== "queued") {
      return;
    }

    requestAnimationFrame(() => {
      requestMessageListScrollToBottom();
      const nodes = document.querySelectorAll(
        `[data-compact-phase="${compactUi.phase}"]`,
      );
      const target = nodes[nodes.length - 1];
      if (target instanceof HTMLElement) {
        target.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
  }, [compactUi]);

  useEffect(() => {
    if (!compactUi) {
      return;
    }

    if (compactUi.phase === "success") {
      const timer = window.setTimeout(() => {
        setSessionCompactUi(chatId, null);
      }, 8_000);
      return () => {
        window.clearTimeout(timer);
      };
    }

    if (compactUi.phase !== "noop" && compactUi.phase !== "error") {
      return;
    }

    const timer = window.setTimeout(() => {
      setSessionCompactUi(chatId, null);
    }, 8_000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [chatId, compactUi]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{
        sessionId: string;
        removedCount: number;
        summaryPreview: string;
        firstKeptMessageId?: string | null;
        compactMessageId?: string | null;
        anchorAfterMessageId?: string | null;
      }>).detail;
      if (!detail || detail.sessionId !== chatId) {
        return;
      }

      if (detail.removedCount > 0) {
        void refresh().then(() => {
          const messages = displayMessagesRef.current;
          const compactMessage =
            (detail.compactMessageId
              ? messages.find((message) => message.id === detail.compactMessageId)
              : undefined) ??
            [...messages]
              .reverse()
              .find((message) => message.messageKind === "compact");
          setSessionCompactUi(
            chatId,
            compactUiFromAgentCompleted(messages, {
              removedCount: detail.removedCount,
              summaryPreview: detail.summaryPreview,
              firstKeptMessageId:
                detail.firstKeptMessageId ?? compactMessage?.taskId ?? null,
              compactMessageId:
                detail.compactMessageId ?? compactMessage?.id ?? null,
              anchorAfterMessageId: detail.anchorAfterMessageId ?? null,
            }),
          );
        });
        return;
      }

      setSessionCompactUi(
        chatId,
        compactUiFromAgentCompleted(displayMessagesRef.current, {
          removedCount: 0,
          summaryPreview: detail.summaryPreview,
        }),
      );
    };

    window.addEventListener("coder:compact-completed", handler);
    return () => window.removeEventListener("coder:compact-completed", handler);
  }, [chatId, refresh]);

  // ── /new command handler ────────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      navigate(paths.chatNew);
    };

    window.addEventListener("coder:command-new", handler);
    return () => window.removeEventListener("coder:command-new", handler);
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        ...
      </div>
    );
  }

  const chatContent = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <ChatHotkeyActions
        chatId={chatId}
        editingMessageId={editingMessageId}
        editingQueuedMessageId={editingQueuedMessageId}
        isRunning={isRunning}
        messages={messages}
        onCancelEdit={handleCancelEdit}
        onEditUserMessage={readOnly ? undefined : handleEditUserMessage}
        onRegenerateAssistantMessage={
          readOnly ? undefined : handleRegenerateAssistantMessage
        }
        onRequestStop={requestStopAgent}
      />
          <ChatMessageList
            compactUi={compactUi}
            editingMessageId={editingMessageId}
            messages={displayMessages}
            onEditUserMessage={readOnly ? undefined : handleEditUserMessage}
            onRegenerateAssistantMessage={
              readOnly ? undefined : handleRegenerateAssistantMessage
            }
            onSystemPromptExpand={() => {
              void refreshSystemPrompt();
            }}
            sessionTitle={session?.title}
            systemPrompt={systemPrompt}
          />

      <div className="shrink-0 px-3 pb-3 pt-2 md:px-4 md:pb-4 md:pt-3">
        <div className="mx-auto w-full max-w-3xl">
          <AgentTodoList sessionId={chatId} isRunning={isRunning} />
          {!readOnly && (
            <QueuedMessageList
              editingMessageId={editingQueuedMessageId}
              messages={queuedMessages}
              onDelete={handleDeleteQueuedMessage}
              onEdit={handleEditQueuedMessage}
            />
          )}
          {isStopConfirmPending ? (
            <AgentStopConfirmBanner
              onConfirm={confirmStopAgent}
              onDismiss={dismissStopConfirm}
            />
          ) : null}
          {!readOnly && !isLoading && session != null && session.id === chatId ? (
          <PlanSheet
            sessionId={chatId}
            workspaceDir={workspaceBinding.workspaceDir}
            planFileName={session.planFileName ?? null}
            planBuiltAt={session.planBuiltAt ?? null}
            planBuildActions={{ isRunning, isBuildPending, onBuild: () => { void handleBuildFromPlan(""); } }}
          />
          ) : null}
          {readOnly ? (
            <SubAgentInfoBar
              model={activeTask?.model ?? model}
              models={allModels}
              agentMode={activeTask?.agentMode ?? "agent"}
              thinkingEnabled={activeTask?.thinkingEnabled ?? thinkingEnabled}
              sessionKind={session?.sessionKind}
              autonomyMode={session?.autonomyMode}
              contextUsage={contextUsage}
              isRunning={isRunning}
              onStop={activeTask ? handleStop : undefined}
            />
          ) : (
          <PromptComposer
            key={editingMessageId ?? editingQueuedMessageId ?? "new"}
            composerKey={editingMessageId ?? editingQueuedMessageId ?? "new"}
            initialValue={editInitialValue}
            initialFiles={editInitialFiles}
            initialReferencedSkills={editInitialReferencedSkills}
            onCancelEdit={
              editingMessageId || editingQueuedMessageId ? handleCancelEdit : undefined
            }
            onSend={handleSend}
            onStop={activeTask ? handleStop : undefined}
            model={model}
            entries={modelEntries}
            getProviderLabel={getProviderLabel}
            onModelChange={handleModelChange}
            thinkingEnabled={thinkingEnabled}
            onThinkingEnabledChange={onThinkingEnabledChange}
            showWorkspaceControls={canEditWorkspace}
            workspaceDir={workspaceBinding.workspaceDir}
            workspaceName={workspaceName}
            gitBranch={gitControls.gitBranch}
            onPickWorkspace={() => {
              void workspaceBinding.handlePickWorkspace();
            }}
            onClearWorkspace={() => {
              void workspaceBinding.handleClearWorkspace();
            }}
            variant="compact"
            isRunning={isRunning}
            contextUsage={contextUsage}
            agentMode={agentMode}
            onAgentModeChange={setAgentMode}
            planBuiltAt={session?.planBuiltAt ?? null}
            sessionKind={session?.sessionKind ?? "standard"}
            mcpServers={enabledMcpServers}
            attachedMcpServers={attachedMcpServers}
            onToggleMcpServer={handleToggleMcpServer}
          />
          )}
        </div>
      </div>
    </div>
  );

  return chatContent;
}
