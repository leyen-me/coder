import { useState } from "react";

import { useTranslation } from "@/lib/i18n/locale-provider";

import { PromptComposer } from "../components/prompt-composer";
import { StarterPromptList } from "../components/starter-prompt-list";
import { DEFAULT_PROJECT_NAME } from "../data/mock-chats";

export function NewChatView() {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState("");

  const handleSend = () => {
    if (!prompt.trim()) {
      return;
    }
    // 后续接入 Agent：createSession → navigate(paths.chat(id))
    console.info("send:", prompt);
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-12">
      <h2 className="max-w-3xl text-center text-2xl font-semibold tracking-tight">
        {t("chat.headline", { project: DEFAULT_PROJECT_NAME })}
      </h2>

      <PromptComposer
        value={prompt}
        onChange={setPrompt}
        onSend={handleSend}
      />

      <StarterPromptList onSelect={setPrompt} />
    </div>
  );
}
