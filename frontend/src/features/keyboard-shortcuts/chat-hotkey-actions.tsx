import { useCallback } from "react";
import { toast } from "sonner";

import { useAgentStore } from "@/features/agent/store/agent-store";
import { getAssistantAnswerText } from "@/features/chat/lib/get-assistant-answer-text";
import { extractLastCodeBlock } from "@/features/keyboard-shortcuts/extract-last-code-block";
import type { MessageRecord } from "@/lib/db";

import { useRegisterHotkeyAction } from "./hotkey-actions-context";

type ChatHotkeyActionsProps = {
  chatId: string;
  messages: MessageRecord[];
  isRunning: boolean;
  editingMessageId: string | null;
  editingQueuedMessageId: string | null;
  onCancelEdit: () => void;
  onRequestStop: () => void;
  onEditUserMessage: (message: MessageRecord) => void;
  onRegenerateAssistantMessage: (message: MessageRecord) => void;
};

function getLastUserMessage(
  messages: MessageRecord[]
): MessageRecord | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") {
      return message;
    }
  }
  return null;
}

function getLastAssistantMessage(
  messages: MessageRecord[]
): MessageRecord | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") {
      return message;
    }
  }
  return null;
}

export function ChatHotkeyActions({
  chatId,
  messages,
  isRunning,
  editingMessageId,
  editingQueuedMessageId,
  onCancelEdit,
  onRequestStop,
  onEditUserMessage,
  onRegenerateAssistantMessage,
}: ChatHotkeyActionsProps) {
  const { getSessionTask } = useAgentStore();

  const handleCancel = useCallback(() => {
    if (editingMessageId || editingQueuedMessageId) {
      onCancelEdit();
      return true;
    }

    const task = getSessionTask(chatId);
    if (task) {
      onRequestStop();
      return true;
    }

    return false;
  }, [
    chatId,
    editingMessageId,
    editingQueuedMessageId,
    getSessionTask,
    onCancelEdit,
    onRequestStop,
  ]);

  const handleRegenerate = useCallback(() => {
    if (isRunning) {
      return false;
    }

    const lastAssistant = getLastAssistantMessage(messages);
    if (!lastAssistant) {
      return false;
    }

    void onRegenerateAssistantMessage(lastAssistant);
    return true;
  }, [isRunning, messages, onRegenerateAssistantMessage]);

  const handleEditLastUser = useCallback(() => {
    if (isRunning) {
      return false;
    }

    const lastUser = getLastUserMessage(messages);
    if (!lastUser) {
      return false;
    }

    onEditUserMessage(lastUser);
    return true;
  }, [isRunning, messages, onEditUserMessage]);

  const handleCopyLastCode = useCallback(() => {
    const lastAssistant = getLastAssistantMessage(messages);
    if (!lastAssistant) {
      return false;
    }

    const codeBlock = extractLastCodeBlock(getAssistantAnswerText(lastAssistant));
    if (!codeBlock) {
      return false;
    }

    void navigator.clipboard.writeText(codeBlock).catch((error: unknown) => {
      if (error instanceof Error && error.message) {
        toast.error(error.message);
      }
    });
    return true;
  }, [messages]);

  useRegisterHotkeyAction("chat.cancel", handleCancel);
  useRegisterHotkeyAction("chat.regenerate", handleRegenerate);
  useRegisterHotkeyAction("chat.editLastUser", handleEditLastUser);
  useRegisterHotkeyAction("chat.copyLastCode", handleCopyLastCode);

  return null;
}
