import type { AgentMode } from "@/features/agent/types";
import type { FileUIPart } from "ai";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { paths } from "@/app/paths";
import { resolveDefaultModelValue } from "@/features/agent/model-preference";
import { useAgentStore } from "@/features/agent/store/agent-store";
import { useLabSettings } from "@/features/lab/use-lab-settings";
import { getWorkspaceDisplayName } from "@/features/workspace/storage";
import { updateSessionMcpServers } from "@/features/mcp/api";
import {
  createSession,
  inferProviderFromModel,
  type McpServerConfig,
  type SessionKind,
} from "@/lib/db";
import { listMcpServers } from "@/lib/db/mcp-servers";
import { parseModelValue } from "@/lib/model-provider/resolve-provider-config";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { useModelProvider } from "@/lib/model-provider/model-provider-provider";

import { PromptComposer } from "../components/prompt-composer";
import { requestMessageListScrollToBottom } from "../components/message-list-scroll";
import { StarterPromptList } from "../components/starter-prompt-list";
import { notifySendMessageError } from "../lib/notify-send-message-error";
import { useComposerThinking } from "../hooks/use-composer-thinking";
import { useWorkspaceGitControls } from "../hooks/use-workspace-git-controls";
import { useNewChatWorkspace } from "../hooks/use-session-workspace-binding";
import { DEFAULT_PROJECT_NAME } from "../data/mock-chats";

export function NewChatView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { allModels, modelEntries, getProviderLabel } = useModelProvider();
  const { sendMessage } = useAgentStore();
  const { settings: labSettings } = useLabSettings();
  const longTaskEnabled = labSettings.longTaskEnabled;
  const { workspaceDir, pickWorkspace, clearWorkspace } = useNewChatWorkspace();
  const [model, setModel] = useState(() => resolveDefaultModelValue(modelEntries));
  const { thinkingEnabled, onThinkingEnabledChange } = useComposerThinking(
    model,
    allModels
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agentMode, setAgentMode] = useState<AgentMode>("agent");
  const [sessionKind, setSessionKind] = useState<SessionKind>("standard");

  // On-demand MCP attachment for the new session (selected before the first
  // message is sent). Local-only until the session exists; persisted right
  // after `createSession` so the session view seeds the same state.
  const [enabledMcpServers, setEnabledMcpServers] = useState<McpServerConfig[]>([]);
  const [attachedMcpServers, setAttachedMcpServers] = useState<string[]>([]);

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

  const handleToggleMcpServer = useCallback((serverId: string) => {
    setAttachedMcpServers((prev) =>
      prev.includes(serverId)
        ? prev.filter((id) => id !== serverId)
        : [...prev, serverId],
    );
  }, []);

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
        decisionModel: parseModelValue(model).modelId,
      });
      // Persist the pre-selected MCP attachment before navigating so the
      // session view seeds the same state (avoids a detach race on first send).
      if (attachedMcpServers.length > 0) {
        await updateSessionMcpServers(session.id, attachedMcpServers);
      }
      navigate(paths.chat(session.id), {
        state: { agentMode, hideWorkspaceControls: true },
      });
      await sendMessage({
        sessionId: session.id,
        content: trimmed,
        images: payload.files,
        model,
        thinkingEnabled,
        agentMode,
        skillSlugs: payload.skillSlugs,
      });
      requestMessageListScrollToBottom();
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
    <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-4 pb-8 md:gap-6 md:px-6 md:pb-12">
        <h2 className="max-w-3xl text-center text-xl font-semibold tracking-tight md:text-2xl">
          {t("chat.headline", {
            project: workspaceName ?? DEFAULT_PROJECT_NAME,
          })}
        </h2>

        <PromptComposer
          onSend={sendText}
          model={model}
          entries={modelEntries}
          getProviderLabel={getProviderLabel}
          onModelChange={setModel}
          thinkingEnabled={thinkingEnabled}
          onThinkingEnabledChange={onThinkingEnabledChange}
          showWorkspaceControls
          workspaceDir={workspaceDir}
          workspaceName={gitControls.workspaceName ?? workspaceName}
          gitBranch={gitControls.gitBranch}
          onPickWorkspace={() => {
            void pickWorkspace();
          }}
          onClearWorkspace={clearWorkspace}
          variant="compact"
          isRunning={isSubmitting}
          agentMode={agentMode}
          onAgentModeChange={setAgentMode}
          sessionKind={longTaskEnabled ? sessionKind : "standard"}
          onSessionKindChange={longTaskEnabled ? setSessionKind : undefined}
          mcpServers={enabledMcpServers}
          attachedMcpServers={attachedMcpServers}
          onToggleMcpServer={handleToggleMcpServer}
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
