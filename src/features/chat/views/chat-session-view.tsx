import { useEffect, useState } from "react";

import { resolveDefaultModel } from "@/features/agent/model-preference";
import { useAgentStore } from "@/features/agent/store/agent-store";
import { useModelProvider } from "@/lib/model-provider/model-provider-provider";

import { MessageList } from "../components/message-list";
import { PromptComposer } from "../components/prompt-composer";
import { useSessionMessages } from "../hooks/use-session-messages";

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

  const activeTask = getSessionTask(chatId);
  const isRunning = isSessionRunning(chatId) || isSubmitting;

  useEffect(() => {
    if (session?.model) {
      setModel(session.model);
    }
  }, [session?.model]);

  const handleSend = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || isRunning) {
      return;
    }

    setIsSubmitting(true);
    setPrompt("");
    try {
      await sendMessage({
        sessionId: chatId,
        content: trimmed,
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

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        ...
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MessageList messages={messages} />

      <div className="shrink-0 px-4 pb-4 pt-3">
        <div className="mx-auto w-full max-w-3xl">
          <PromptComposer
            value={prompt}
            onChange={setPrompt}
            onSend={() => {
              void handleSend();
            }}
            onStop={handleStop}
            model={model}
            models={resolved.models}
            onModelChange={setModel}
            variant="compact"
            isRunning={isRunning}
          />
        </div>
      </div>
    </div>
  );
}
