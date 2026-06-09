import type { FileUIPart } from "ai";
import { useCallback, useEffect, useMemo, useState } from "react";

import { storedImagesToFileUIParts } from "@/features/agent/message-content";
import { resolveDefaultModel } from "@/features/agent/model-preference";
import { useAgentStore } from "@/features/agent/store/agent-store";
import { getWorkspaceDisplayName } from "@/features/workspace/storage";
import { useModelProvider } from "@/lib/model-provider/model-provider-provider";

import { ChatMessageList } from "../components/chat-message-list";
import { PromptComposer } from "../components/prompt-composer";
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
  const { resolved } = useModelProvider();
  const {
    sendMessage,
    regenerateMessage,
    cancelTask,
    getSessionTask,
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

  const canEditWorkspace = messages.length === 0;
  const workspaceBinding = useSessionWorkspaceBinding({
    session,
    canEdit: canEditWorkspace,
  });

  const gitControls = useWorkspaceGitControls({
    workspaceDir: workspaceBinding.workspaceDir,
    enabled: canEditWorkspace,
  });
  const systemPrompt = useSystemPrompt(workspaceBinding.workspaceDir);

  const activeTask = getSessionTask(chatId);
  const isRunning = isSessionRunning(chatId) || isSubmitting;

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
      });
    },
    [cancelTask, chatId, getSessionTask, isRunning, model, regenerateMessage, thinkingEnabled]
  );

  const handleSend = async (payload: { text: string; files: FileUIPart[] }) => {
    const trimmed = payload.text.trim();
    const hasImages = payload.files.length > 0;
    if ((!trimmed && !hasImages) || (isRunning && !editingMessageId)) {
      return;
    }

    setIsSubmitting(true);
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
      });
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
    <>
      <ChatMessageList
        editingMessageId={editingMessageId}
        messages={messages}
        onEditUserMessage={handleEditUserMessage}
        onRegenerateAssistantMessage={handleRegenerateAssistantMessage}
        sessionTitle={session?.title}
        systemPrompt={systemPrompt}
      />

      <div className="shrink-0 px-4 pb-4 pt-3">
        <div className="mx-auto w-full max-w-3xl">
          <PromptComposer
            composerKey={editingMessageId ?? "new"}
            initialFiles={editInitialFiles}
            value={prompt}
            onCancelEdit={editingMessageId ? handleCancelEdit : undefined}
            onChange={setPrompt}
            onSend={(payload) => {
              void handleSend(payload);
            }}
            onStop={handleStop}
            model={model}
            models={resolved.models}
            onModelChange={setModel}
            thinkingEnabled={thinkingEnabled}
            onThinkingEnabledChange={onThinkingEnabledChange}
            showWorkspaceControls={canEditWorkspace}
            workspaceName={workspaceName}
            onPickWorkspace={() => {
              void workspaceBinding.handlePickWorkspace();
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
          />
        </div>
      </div>
    </>
  );

  return chatContent;
}
