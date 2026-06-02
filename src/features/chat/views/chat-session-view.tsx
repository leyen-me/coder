import type { FileUIPart } from "ai";
import { useEffect, useState } from "react";

import { resolveDefaultModel } from "@/features/agent/model-preference";
import { useAgentStore } from "@/features/agent/store/agent-store";
import { getWorkspaceDisplayName } from "@/features/workspace/storage";
import { useModelProvider } from "@/lib/model-provider/model-provider-provider";

import { MessageList } from "../components/message-list";
import { PromptComposer } from "../components/prompt-composer";
import { useSessionMessages } from "../hooks/use-session-messages";
import { useSessionWorkspaceBinding } from "../hooks/use-session-workspace-binding";
import { useWorkspaceGitControls } from "../hooks/use-workspace-git-controls";

type ChatSessionViewProps = {
  chatId: string;
};

export function ChatSessionView({ chatId }: ChatSessionViewProps) {
  const { resolved } = useModelProvider();
  const { sendMessage, cancelTask, getSessionTask, isSessionRunning } =
    useAgentStore();
  const { session, messages, isLoading } = useSessionMessages(chatId);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(() => resolveDefaultModel(resolved));
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

  const activeTask = getSessionTask(chatId);
  const isRunning = isSessionRunning(chatId) || isSubmitting;

  useEffect(() => {
    if (session?.model) {
      setModel(session.model);
    }
  }, [session?.model]);

  const handleSend = async (payload: { text: string; files: FileUIPart[] }) => {
    const trimmed = payload.text.trim();
    const hasImages = payload.files.length > 0;
    if ((!trimmed && !hasImages) || isRunning) {
      return;
    }

    setIsSubmitting(true);
    setPrompt("");
    try {
      await sendMessage({
        sessionId: chatId,
        content: trimmed,
        images: payload.files,
        model,
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

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        ...
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MessageList messages={messages} sessionTitle={session?.title} />

      <div className="shrink-0 px-4 pb-4 pt-3">
        <div className="mx-auto w-full max-w-3xl">
          <PromptComposer
            value={prompt}
            onChange={setPrompt}
            onSend={(payload) => {
              void handleSend(payload);
            }}
            onStop={handleStop}
            model={model}
            models={resolved.models}
            onModelChange={setModel}
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
          />
        </div>
      </div>
    </div>
  );
}
