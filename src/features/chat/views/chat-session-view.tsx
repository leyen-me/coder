import type { AgentMode } from "@/features/agent/types";
import type { FileUIPart } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { LoaderCircleIcon } from "lucide-react";
import { nanoid } from "nanoid";

import { storedImagesToFileUIParts } from "@/features/agent/message-content";
import { resolveDefaultModel } from "@/features/agent/model-preference";
import { useAgentStore } from "@/features/agent/store/agent-store";
import { usePromptRefiner } from "@/features/lab/prompt-refine-provider";
import { buildRefineContextMessages } from "@/features/lab/refine-prompt";
import { getWorkspaceDisplayName } from "@/features/workspace/storage";
import { useModelProvider } from "@/lib/model-provider/model-provider-provider";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { ChatHotkeyActions } from "@/features/keyboard-shortcuts/chat-hotkey-actions";

import { AgentStopConfirmBanner } from "../components/agent-stop-confirm-banner";
import { AgentTodoList } from "../components/agent-todo-list";
import { PlanSheet } from "../components/plan-sheet";
import { useAgentStopConfirmation } from "../hooks/use-agent-stop-confirmation";
import { ChatMessageList } from "../components/chat-message-list";
import { PromptComposer } from "../components/prompt-composer";
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
import { estimateSessionContextUsage } from "../lib/estimate-session-context-usage";
import {
  useDisplayMessages,
  useSessionData,
} from "../hooks/use-session-messages";
import { useSessionWorkspaceBinding } from "../hooks/use-session-workspace-binding";
import { useSystemPrompt } from "../hooks/use-system-prompt";
import { useWorkspaceGitControls } from "../hooks/use-workspace-git-controls";
import type { MessageRecord } from "@/lib/db";
import { resolveAgentSessionPolicy } from "@/features/agent/session-policy";
import {
  buildHandoffPreviewMessages,
  buildHandoffPreviewSessionPatch,
  getHandoffPreviewHint,
  getHandoffPreviewMode,
  getHandoffPreviewProgressPhase,
} from "../lib/handoff/mock-handoff-preview";
import { HandoffPreviewBanner } from "../components/handoff-preview-banner";

type ChatSessionViewProps = {
  chatId: string;
};

export function ChatSessionView({ chatId }: ChatSessionViewProps) {
  const { t } = useTranslation();
  const { allModels, modelProviders } = useModelProvider();
  const {
    sendMessage,
    regenerateMessage,
    cancelTask,
    getSessionTask,
    getSessionHandoffState,
    isSessionRunning,
  } = useAgentStore();
  const { refineIfEnabled } = usePromptRefiner();
  const location = useLocation();
  const handoffPreviewMode = getHandoffPreviewMode();
  const { session, messages, isLoading } = useSessionData(chatId);
  const previewMessages = useMemo(() => {
    if (!handoffPreviewMode || handoffPreviewMode === "progress") {
      return null;
    }

    return buildHandoffPreviewMessages({
      mode: handoffPreviewMode,
      sessionId: chatId,
    });
  }, [chatId, handoffPreviewMode]);
  const previewSession = useMemo(() => {
    if (!handoffPreviewMode || !session) {
      return session;
    }

    const patch = buildHandoffPreviewSessionPatch({
      mode: handoffPreviewMode,
      session,
    });

    return patch ? { ...session, ...patch } : session;
  }, [handoffPreviewMode, session]);
  const effectiveSession = previewSession ?? session;
  const effectiveMessages = previewMessages ?? messages;
  const displayMessages = useDisplayMessages(effectiveMessages);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingQueuedMessageId, setEditingQueuedMessageId] = useState<string | null>(
    null
  );
  const [editInitialFiles, setEditInitialFiles] = useState<FileUIPart[]>([]);
  const [editInitialValue, setEditInitialValue] = useState("");
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
  const queueDispatchingRef = useRef(false);
  const [model, setModel] = useState(() => resolveDefaultModel({ models: allModels }));
  const { thinkingEnabled, onThinkingEnabledChange } = useComposerThinking(
    model,
    allModels
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBuildPending, setIsBuildPending] = useState(false);
  const initialAgentModeFromState =
    (location.state as { agentMode?: AgentMode } | null)?.agentMode ?? "agent";
  const [agentMode, setAgentMode] = useState<AgentMode>(initialAgentModeFromState);

  const canEditWorkspace = effectiveMessages.length === 0;
  const workspaceBinding = useSessionWorkspaceBinding({
    session: effectiveSession,
    canEdit: canEditWorkspace,
  });
  const sessionPolicy = useMemo(
    () => (effectiveSession ? resolveAgentSessionPolicy(effectiveSession) : null),
    [effectiveSession]
  );

  const gitControls = useWorkspaceGitControls({
    workspaceDir: workspaceBinding.workspaceDir,
    enabled: canEditWorkspace,
  });
  const { systemPrompt, refreshSystemPrompt } = useSystemPrompt(
    workspaceBinding.workspaceDir,
    agentMode,
    sessionPolicy
  );

  const activeTask = getSessionTask(chatId);
  const handoffState = getSessionHandoffState(chatId);
  const isRunning = isSessionRunning(chatId) || isSubmitting || isBuildPending;

  useEffect(() => {
    if (session?.model) {
      setModel(session.model);
    }
  }, [session?.model]);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditingQueuedMessageId(null);
    setEditInitialFiles([]);
    setEditInitialValue("");
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
      } catch (error) {
        notifySendMessageError(error, (key, params) =>
          t(`chat.${key}`, params)
        );

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

      setIsBuildPending(true);
      setAgentMode("agent");
      try {
        const resolved = await resolvePlanContentForBuild(
          workspaceBinding.workspaceDir,
          planContent
        );
        await sendMessage({
          sessionId: chatId,
          content: buildPlanExecutionPrompt(resolved.content, resolved.path),
          model,
          thinkingEnabled,
          agentMode: "agent",
          skillSlugs: [],
        });
      } catch (error) {
        notifySendMessageError(error, (key, params) =>
          t(`chat.${key}`, params)
        );
      } finally {
        setIsBuildPending(false);
      }
    },
    [
      chatId,
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
          })
        );
        setEditingQueuedMessageId(null);
        setEditInitialFiles([]);
        return;
      }

      let finalText = trimmed;
      if (trimmed) {
        setIsSubmitting(true);
        try {
          const refineResult = await refineIfEnabled(
            trimmed,
            buildRefineContextMessages(messages),
            model
          );
          if (refineResult === "cancelled") {
            return;
          }
          finalText =
            refineResult === "original" ? trimmed : refineResult.text;
        } finally {
          setIsSubmitting(false);
        }
      }

      if (isRunning && !editingMessageId) {
        setQueuedMessages((currentQueue) => [
          ...currentQueue,
          {
            id: nanoid(),
            text: finalText,
            files: payload.files,
          },
        ]);
        setEditInitialFiles([]);
        return;
      }

      const editingId = editingMessageId;
      setEditingMessageId(null);
      setEditInitialFiles([]);
      await sendPayload(
        {
          text: finalText,
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
      isRunning,
      messages,
      model,
      refineIfEnabled,
      sendPayload,
    ]
  );

  const handleEditQueuedMessage = useCallback((message: QueuedMessage) => {
    setEditingMessageId(null);
    setEditingQueuedMessageId(message.id);
    setEditInitialValue(message.text);
    setEditInitialFiles(message.files);
  }, []);

  const handleDeleteQueuedMessage = useCallback((messageId: string) => {
    setQueuedMessages((currentQueue) => removeQueuedMessage(currentQueue, messageId));
    if (editingQueuedMessageId === messageId) {
      setEditingQueuedMessageId(null);
      setEditInitialFiles([]);
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
  const handoffStatus = useMemo(() => {
    if (handoffPreviewMode === "progress") {
      const phase = getHandoffPreviewProgressPhase();
      switch (phase) {
        case "generating_handoff":
          return {
            label: t("chat.handoffGenerating"),
            step: 1,
          };
        case "creating_session":
          return {
            label: t("chat.handoffCreatingSession"),
            step: 2,
          };
        case "starting_new_session":
          return {
            label: t("chat.handoffStartingNewSession"),
            step: 3,
          };
      }
    }

    if (!handoffState) {
      return null;
    }

    switch (handoffState.phase) {
      case "generating_handoff":
        return {
          label: t("chat.handoffGenerating"),
          step: 1,
        };
      case "creating_session":
        return {
          label: t("chat.handoffCreatingSession"),
          step: 2,
        };
      case "starting_new_session":
        return {
          label: t("chat.handoffStartingNewSession"),
          step: 3,
        };
      default:
        return null;
    }
  }, [handoffPreviewMode, handoffState, t]);

  const contextUsage = useMemo(
    () =>
      estimateSessionContextUsage({
        messages: displayMessages,
        systemPrompt,
        modelId: model,
        models: allModels,
        editingMessageId,
      }),
    [
      displayMessages,
      editingMessageId,
      model,
      allModels,
      systemPrompt,
    ]
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        ...
      </div>
    );
  }

  const chatContent = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {handoffPreviewMode ? (
        <HandoffPreviewBanner hint={getHandoffPreviewHint(handoffPreviewMode)} />
      ) : null}
      <ChatHotkeyActions
        chatId={chatId}
        editingMessageId={editingMessageId}
        editingQueuedMessageId={editingQueuedMessageId}
        isRunning={isRunning}
        messages={effectiveMessages}
        onCancelEdit={handleCancelEdit}
        onEditUserMessage={handleEditUserMessage}
        onRegenerateAssistantMessage={handleRegenerateAssistantMessage}
        onRequestStop={requestStopAgent}
      />
      <ChatMessageList
        editingMessageId={editingMessageId}
        handoffFromSessionId={effectiveSession?.handoffFromSessionId}
        messages={effectiveMessages}
        onEditUserMessage={handleEditUserMessage}
        onRegenerateAssistantMessage={handleRegenerateAssistantMessage}
        onSystemPromptExpand={() => {
          void refreshSystemPrompt();
        }}
        sessionTitle={effectiveSession?.title}
        systemPrompt={systemPrompt}
      />

      <div className="shrink-0 px-4 pb-4 pt-3">
        <div className="mx-auto w-full max-w-3xl">
          <AgentTodoList sessionId={chatId} isRunning={isRunning} />
          <QueuedMessageList
            editingMessageId={editingQueuedMessageId}
            messages={queuedMessages}
            onDelete={handleDeleteQueuedMessage}
            onEdit={handleEditQueuedMessage}
          />
          {isStopConfirmPending ? (
            <AgentStopConfirmBanner
              onConfirm={confirmStopAgent}
              onDismiss={dismissStopConfirm}
            />
          ) : null}
          {handoffStatus ? (
            <div className="mb-2 overflow-hidden rounded-2xl border bg-muted/40 px-3 py-2.5 dark:bg-muted/20">
              <div className="flex items-center gap-2">
                <LoaderCircleIcon className="size-4 shrink-0 animate-spin text-muted-foreground" />
                <p className="min-w-0 flex-1 text-foreground text-sm">
                  {handoffStatus.label}
                </p>
                <span className="shrink-0 tabular-nums text-muted-foreground text-xs">
                  {handoffStatus.step}/3
                </span>
              </div>
            </div>
          ) : null}
          <PlanSheet
            workspaceDir={workspaceBinding.workspaceDir}
            planBuildActions={{ isRunning, isBuildPending, onBuild: () => { void handleBuildFromPlan(""); } }}
          />
          <PromptComposer
            key={editingMessageId ?? editingQueuedMessageId ?? "new"}
            composerKey={editingMessageId ?? editingQueuedMessageId ?? "new"}
            initialValue={editInitialValue}
            initialFiles={editInitialFiles}
            onCancelEdit={
              editingMessageId || editingQueuedMessageId ? handleCancelEdit : undefined
            }
            onSend={handleSend}
            onStop={activeTask ? handleStop : undefined}
            model={model}
            models={allModels}
            modelProviders={modelProviders}
            onModelChange={setModel}
            thinkingEnabled={thinkingEnabled}
            onThinkingEnabledChange={onThinkingEnabledChange}
            showWorkspaceControls={canEditWorkspace}
            workspaceDir={workspaceBinding.workspaceDir}
            workspaceName={workspaceName}
            onPickWorkspace={() => {
              void workspaceBinding.handlePickWorkspace();
            }}
            onClearWorkspace={() => {
              void workspaceBinding.handleClearWorkspace();
            }}
            isGitRepository={gitControls.isGitRepository}
            gitBranch={gitControls.gitBranch}
            gitBranches={gitControls.gitBranches}
            onGitBranchChange={(branch) => {
              void workspaceBinding
                .handleBranchChange(branch)
                .then(() => gitControls.refreshGit());
            }}
            isGitLoading={gitControls.isGitLoading}
            variant="compact"
            isRunning={isRunning}
            contextUsage={contextUsage}
            agentMode={agentMode}
            onAgentModeChange={setAgentMode}
            sessionKind={effectiveSession?.sessionKind ?? "standard"}
          />
        </div>
      </div>
    </div>
  );

  return chatContent;
}
