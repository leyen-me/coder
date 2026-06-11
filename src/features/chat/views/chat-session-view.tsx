import type { AgentMode } from "@/features/agent/types";
import type { FileUIPart } from "ai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { LoaderCircleIcon } from "lucide-react";

import { storedImagesToFileUIParts } from "@/features/agent/message-content";
import { resolveDefaultModel } from "@/features/agent/model-preference";
import { useAgentStore } from "@/features/agent/store/agent-store";
import { getWorkspaceDisplayName } from "@/features/workspace/storage";
import { useModelProvider } from "@/lib/model-provider/model-provider-provider";
import { useTranslation } from "@/lib/i18n/locale-provider";

import { AgentTodoList } from "../components/agent-todo-list";
import { ChatMessageList } from "../components/chat-message-list";
import { PromptComposer } from "../components/prompt-composer";
import { notifySendMessageError } from "../lib/notify-send-message-error";
import { buildPlanExecutionPrompt } from "../lib/plan/build-plan-execution-prompt";
import {
  getLatestPlanMessage,
} from "../lib/plan/get-latest-plan-message";
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

type ChatSessionViewProps = {
  chatId: string;
};

export function ChatSessionView({ chatId }: ChatSessionViewProps) {
  const { t } = useTranslation();
  const { resolved } = useModelProvider();
  const {
    sendMessage,
    regenerateMessage,
    cancelTask,
    getSessionTask,
    getSessionHandoffState,
    isSessionRunning,
  } = useAgentStore();
  const { session, messages, isLoading } = useSessionData(chatId);
  const displayMessages = useDisplayMessages(messages);
  const [prompt, setPrompt] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editInitialFiles, setEditInitialFiles] = useState<FileUIPart[]>([]);
  const [model, setModel] = useState(() => resolveDefaultModel(resolved));
  const { thinkingEnabled, onThinkingEnabledChange } = useComposerThinking(
    model,
    resolved.models
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBuildPending, setIsBuildPending] = useState(false);
  const location = useLocation();
  const initialAgentModeFromState =
    (location.state as { agentMode?: AgentMode } | null)?.agentMode ?? "agent";
  const [agentMode, setAgentMode] = useState<AgentMode>(initialAgentModeFromState);

  const canEditWorkspace = messages.length === 0;
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
    agentMode
  );

  const activeTask = getSessionTask(chatId);
  const handoffState = getSessionHandoffState(chatId);
  const isRunning = isSessionRunning(chatId) || isSubmitting || isBuildPending;
  const latestPlanMessage = useMemo(
    () => getLatestPlanMessage(displayMessages),
    [displayMessages]
  );

  useEffect(() => {
    if (session?.model) {
      setModel(session.model);
    }
  }, [session?.model]);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditInitialFiles([]);
    setPrompt("");
  }, []);

  const handleEditUserMessage = useCallback(
    (message: MessageRecord) => {
      const task = getSessionTask(chatId);
      if (task) {
        void cancelTask(task.taskId);
      }

      setEditingMessageId(message.id);
      setPrompt(message.content);
      setEditInitialFiles(storedImagesToFileUIParts(message.images ?? []));
    },
    [cancelTask, chatId, getSessionTask]
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
        await sendMessage({
          sessionId: chatId,
          content: buildPlanExecutionPrompt(planContent),
          model,
          thinkingEnabled,
          agentMode: "agent",
        });
      } catch (error) {
        notifySendMessageError(error, (key, params) =>
          t(`chat.${key}`, params)
        );
      } finally {
        setIsBuildPending(false);
      }
    },
    [chatId, isRunning, model, sendMessage, t, thinkingEnabled]
  );

  const handleSend = async (payload: { text: string; files: FileUIPart[] }) => {
    const trimmed = payload.text.trim();
    const hasImages = payload.files.length > 0;
    if ((!trimmed && !hasImages) || (isRunning && !editingMessageId)) {
      return;
    }

    setIsSubmitting(true);
    const previousPrompt = trimmed;
    const editingId = editingMessageId;
    setPrompt("");
    setEditingMessageId(null);
    setEditInitialFiles([]);
    try {
      await sendMessage({
        sessionId: chatId,
        content: trimmed,
        images: payload.files,
        model,
        thinkingEnabled,
        editMessageId: editingId ?? undefined,
        agentMode,
      });
    } catch (error) {
      notifySendMessageError(error, (key, params) =>
        t(`chat.${key}`, params)
      );
      setPrompt(previousPrompt);
      if (editingId) {
        setEditingMessageId(editingId);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStop = () => {
    if (activeTask) {
      void cancelTask(activeTask.taskId);
    }
  };

  const workspaceName = workspaceBinding.workspaceDir
    ? getWorkspaceDisplayName(workspaceBinding.workspaceDir)
    : null;
  const handoffStatus = useMemo(() => {
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
  }, [handoffState, t]);

  const contextUsage = useMemo(
    () =>
      estimateSessionContextUsage({
        messages: displayMessages,
        systemPrompt,
        modelId: model,
        models: resolved.models,
        editingMessageId,
      }),
    [
      displayMessages,
      editingMessageId,
      model,
      resolved.models,
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
      <ChatMessageList
        editingMessageId={editingMessageId}
        isBuildPending={isBuildPending}
        latestPlanMessageId={latestPlanMessage?.id ?? null}
        messages={messages}
        onBuildFromPlan={(planContent) => {
          void handleBuildFromPlan(planContent);
        }}
        onEditUserMessage={handleEditUserMessage}
        onRegenerateAssistantMessage={handleRegenerateAssistantMessage}
        onSystemPromptExpand={() => {
          void refreshSystemPrompt();
        }}
        sessionTitle={session?.title}
        systemPrompt={systemPrompt}
      />

      <div className="shrink-0 px-4 pb-4 pt-3">
        <div className="mx-auto w-full max-w-3xl">
          <AgentTodoList sessionId={chatId} isRunning={isRunning} />
          {handoffStatus ? (
            <div className="mb-2 overflow-hidden rounded-2xl border bg-muted/40 px-3 py-2.5 dark:bg-muted/20">
              <div className="flex items-center gap-2">
                <LoaderCircleIcon className="size-4 shrink-0 animate-spin text-muted-foreground" />
                <p className="min-w-0 flex-1 text-foreground text-sm">
                  {handoffStatus.label}
                </p>
              </div>
              <div className="mt-2 flex gap-1.5">
                {[1, 2, 3].map((step) => (
                  <div
                    key={step}
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className={`h-full rounded-full transition-all ${
                        step < handoffStatus.step
                          ? "w-full bg-foreground/70"
                          : step === handoffStatus.step
                            ? "w-2/3 animate-pulse bg-foreground/85"
                            : "w-0 bg-foreground/30"
                      }`}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <PromptComposer
            composerKey={editingMessageId ?? "new"}
            initialFiles={editInitialFiles}
            value={prompt}
            onCancelEdit={editingMessageId ? handleCancelEdit : undefined}
            onChange={setPrompt}
            onSend={(payload) => {
              void handleSend(payload);
            }}
            onStop={activeTask ? handleStop : undefined}
            model={model}
            models={resolved.models}
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
          />
        </div>
      </div>
    </div>
  );

  return chatContent;
}
