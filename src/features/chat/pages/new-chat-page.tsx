import { useState } from "react";

import { DEFAULT_PROJECT_NAME } from "../data/mock-chats";
import { PromptComposer } from "../components/prompt-composer";
import { StarterPromptList } from "../components/starter-prompt-list";

export function NewChatPage() {
  const [prompt, setPrompt] = useState("");

  const handleSend = () => {
    if (!prompt.trim()) {
      return;
    }
    // 后续接入 Agent 会话流
    console.info("send:", prompt);
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-12">
      <h2 className="max-w-3xl text-center text-2xl font-semibold tracking-tight">
        想在 {DEFAULT_PROJECT_NAME} 里构建什么？
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
