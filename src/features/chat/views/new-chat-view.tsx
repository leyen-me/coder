import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { paths } from "@/app/paths";
import { resolveDefaultModel } from "@/features/agent/model-preference";
import { useAgentStore } from "@/features/agent/store/agent-store";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { createSession } from "@/lib/db";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { useModelProvider } from "@/lib/model-provider/model-provider-provider";

import { PromptComposer } from "../components/prompt-composer";
import { StarterPromptList } from "../components/starter-prompt-list";
import { DEFAULT_PROJECT_NAME } from "../data/mock-chats";

export function NewChatView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { resolved } = useModelProvider();
  const { sendMessage } = useAgentStore();
  const { workspaceName, pickWorkspace } = useWorkspace();
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(() => resolveDefaultModel(resolved));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSend = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      const session = await createSession({
        title: t("session.newChat"),
        model,
      });
      navigate(paths.chat(session.id));
      setPrompt("");
      await sendMessage({
        sessionId: session.id,
        content: trimmed,
        model,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

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
        onSend={() => {
          void handleSend();
        }}
        model={model}
        models={resolved.models}
        onModelChange={setModel}
        workspaceName={workspaceName}
        onPickWorkspace={() => {
          void pickWorkspace();
        }}
        variant="full"
        isRunning={isSubmitting}
      />

      <StarterPromptList onSelect={setPrompt} />
    </div>
  );
}
