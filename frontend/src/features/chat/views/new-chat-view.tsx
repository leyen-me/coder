import type { AgentMode } from "@/features/agent/types";
import type { FileUIPart } from "ai";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { paths } from "@/app/paths";
import { resolveDefaultModel } from "@/features/agent/model-preference";
import { useAgentStore } from "@/features/agent/store/agent-store";
import { usePromptRefiner } from "@/features/lab/prompt-refine-provider";
import { useLabSettings } from "@/features/lab/use-lab-settings";
import { getWorkspaceDisplayName } from "@/features/workspace/storage";
import { createSession, inferProviderFromModel, type SessionKind } from "@/lib/db";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { useModelProvider } from "@/lib/model-provider/model-provider-provider";

import { PromptComposer } from "../components/prompt-composer";
import { StarterPromptList } from "../components/starter-prompt-list";
import { notifySendMessageError } from "../lib/notify-send-message-error";
import { useComposerThinking } from "../hooks/use-composer-thinking";
import { useWorkspaceGitControls } from "../hooks/use-workspace-git-controls";
import { useNewChatWorkspace } from "../hooks/use-session-workspace-binding";
import { DEFAULT_PROJECT_NAME } from "../data/mock-chats";

export function NewChatView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { allModels, modelProviders } = useModelProvider();
  const { sendMessage } = useAgentStore();
  const { refineIfEnabled } = usePromptRefiner();
  const { settings: labSettings } = useLabSettings();
  const longTaskEnabled = labSettings.longTaskEnabled;
  const { workspaceDir, pickWorkspace, clearWorkspace } = useNewChatWorkspace();
  const [model, setModel] = useState(() => resolveDefaultModel({ models: allModels }));
  const { thinkingEnabled, onThinkingEnabledChange } = useComposerThinking(
    model,
    allModels
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agentMode, setAgentMode] = useState<AgentMode>("agent");
  const [sessionKind, setSessionKind] = useState<SessionKind>("standard");

  useEffect(() => {
    if (!longTaskEnabled && sessionKind === "long_task") {
      setSessionKind("standard");
    }
  }, [longTaskEnabled, sessionKind]);

  const gitControls = useWorkspaceGitControls({
    workspaceDir,
    enabled: true,
  });

  const sendText = async (payload: { text: string; files: FileUIPart[]; skillSlugs?: string[] }) => {
    const trimmed = payload.text.trim();
    const hasImages = payload.files.length > 0;
    if ((!trimmed && !hasImages) || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      const refineResult = await refineIfEnabled(trimmed, [], model);
      if (refineResult === "cancelled") {
        return;
      }
      const finalText =
        refineResult === "original" ? trimmed : refineResult.text;

      const effectiveSessionKind = longTaskEnabled ? sessionKind : "standard";
      const provider = inferProviderFromModel(null, model);
      const session = await createSession({
        title: t("session.newChat"),
        model,
        provider,
        workspaceDir,
        sessionKind: effectiveSessionKind,
        autonomyMode:
          effectiveSessionKind === "long_task" ? "unattended" : "interactive",
        decisionModel: model,
      });
      navigate(paths.chat(session.id), { state: { agentMode } });
      await sendMessage({
        sessionId: session.id,
        content: finalText,
        images: payload.files,
        model,
        thinkingEnabled,
        agentMode,
        skillSlugs: payload.skillSlugs,
      });
    } catch (error) {
      notifySendMessageError(error, (key, params) =>
        t(`chat.${key}`, params)
      );
      // Re-throw so PromptComposer can restore the input value
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStarterSelect = async (prompt: string) => {
    // When a starter prompt is selected, immediately send it
    // without going through the composer.
    await sendText({ text: prompt, files: [], skillSlugs: [] }).catch(() => {
      // Error already handled in sendText
    });
  };

  const workspaceName = workspaceDir
    ? getWorkspaceDisplayName(workspaceDir)
    : null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-6 pb-12">
        <h2 className="max-w-3xl text-center text-2xl font-semibold tracking-tight">
          {t("chat.headline", {
            project: workspaceName ?? DEFAULT_PROJECT_NAME,
          })}
        </h2>

        <PromptComposer
          onSend={sendText}
          model={model}
          models={allModels}
          modelProviders={modelProviders}
          onModelChange={setModel}
          thinkingEnabled={thinkingEnabled}
          onThinkingEnabledChange={onThinkingEnabledChange}
          showWorkspaceControls={false}
          workspaceDir={workspaceDir}
          gitBranch={gitControls.gitBranch}
          variant="compact"
          isRunning={isSubmitting}
          agentMode={agentMode}
          onAgentModeChange={setAgentMode}
          sessionKind={longTaskEnabled ? sessionKind : "standard"}
          onSessionKindChange={longTaskEnabled ? setSessionKind : undefined}
        />
        {longTaskEnabled && sessionKind === "long_task" ? (
          <p className="max-w-3xl px-2 text-center text-muted-foreground text-sm">
            {t("chat.sessionTypeLongTaskHint")}
          </p>
        ) : null}

        <StarterPromptList onSelect={handleStarterSelect} />
    </div>
  );
}
