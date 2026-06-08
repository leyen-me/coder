import type { FileUIPart } from "ai";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { paths } from "@/app/paths";
import { resolveDefaultModel } from "@/features/agent/model-preference";
import { useAgentStore } from "@/features/agent/store/agent-store";
import { getWorkspaceDisplayName } from "@/features/workspace/storage";
import { resolveInitialSessionWorkspaceDir } from "@/features/workspace/resolve-session-workspace";
import { createSession } from "@/lib/db";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { useModelProvider } from "@/lib/model-provider/model-provider-provider";

import { PromptComposer } from "../components/prompt-composer";
import { StarterPromptList } from "../components/starter-prompt-list";
import { useComposerThinking } from "../hooks/use-composer-thinking";
import { useWorkspaceGitControls } from "../hooks/use-workspace-git-controls";
import { useNewChatWorkspace } from "../hooks/use-session-workspace-binding";
import { DEFAULT_PROJECT_NAME } from "../data/mock-chats";

export function NewChatView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { resolved } = useModelProvider();
  const { sendMessage } = useAgentStore();
  const { workspaceDir, pickWorkspace } = useNewChatWorkspace();
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(() => resolveDefaultModel(resolved));
  const { thinkingEnabled, onThinkingEnabledChange } = useComposerThinking(
    model,
    resolved.models
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const gitControls = useWorkspaceGitControls({
    workspaceDir,
    enabled: true,
  });

  const handleSend = async (payload: { text: string; files: FileUIPart[] }) => {
    const trimmed = payload.text.trim();
    const hasImages = payload.files.length > 0;
    if ((!trimmed && !hasImages) || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      const session = await createSession({
        title: t("session.newChat"),
        model,
        workspaceDir: resolveInitialSessionWorkspaceDir(),
      });
      navigate(paths.chat(session.id));
      setPrompt("");
      await sendMessage({
        sessionId: session.id,
        content: trimmed,
        images: payload.files,
        model,
        thinkingEnabled,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const workspaceName = workspaceDir
    ? getWorkspaceDisplayName(workspaceDir)
    : null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-12">
      <h2 className="max-w-3xl text-center text-2xl font-semibold tracking-tight">
        {t("chat.headline", {
          project: workspaceName ?? DEFAULT_PROJECT_NAME,
        })}
      </h2>

      <PromptComposer
        value={prompt}
        onChange={setPrompt}
        onSend={(payload) => {
          void handleSend(payload);
        }}
        model={model}
        models={resolved.models}
        onModelChange={setModel}
        thinkingEnabled={thinkingEnabled}
        onThinkingEnabledChange={onThinkingEnabledChange}
        showWorkspaceControls
        workspaceName={gitControls.workspaceName ?? workspaceName}
        onPickWorkspace={() => {
          void pickWorkspace();
        }}
        isGitRepository={gitControls.isGitRepository}
        gitBranch={gitControls.gitBranch}
        gitBranches={gitControls.gitBranches}
        onGitBranchChange={(branch) => {
          void gitControls.checkoutBranch(branch);
        }}
        isGitLoading={gitControls.isGitLoading}
        variant="compact"
        isRunning={isSubmitting}
      />

      <StarterPromptList onSelect={setPrompt} />
    </div>
  );
}
