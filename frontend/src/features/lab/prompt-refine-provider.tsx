import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useModelProvider } from "@/lib/model-provider/model-provider-provider";

import { PromptRefineDialog } from "./prompt-refine-dialog";
import { refinePrompt, type RefineContextMessage } from "./refine-prompt";
import { useLabSettings } from "./use-lab-settings";

export type PromptRefineResult =
  | "original"
  | { type: "refined"; text: string }
  | "cancelled";

type PendingRefine = {
  originalText: string;
  refinedText: string;
  resolve: (result: PromptRefineResult) => void;
};

type PromptRefineContextValue = {
  refineIfEnabled: (
    text: string,
    contextMessages: RefineContextMessage[],
    model: string
  ) => Promise<PromptRefineResult>;
};

const PromptRefineContext = createContext<PromptRefineContextValue | null>(null);

export function PromptRefineProvider({ children }: { children: ReactNode }) {
  const { settings } = useLabSettings();
  const { resolveProviderForModel } = useModelProvider();
  const [pendingRefine, setPendingRefine] = useState<PendingRefine | null>(null);
  const pendingRefineRef = useRef<PendingRefine | null>(null);

  const settlePendingRefine = useCallback((result: PromptRefineResult) => {
    const pending = pendingRefineRef.current;
    pendingRefineRef.current = null;
    setPendingRefine(null);
    pending?.resolve(result);
  }, []);

  const showConfirmDialog = useCallback(
    (originalText: string, refinedText: string) => {
      return new Promise<PromptRefineResult>((resolve) => {
        const pending: PendingRefine = {
          originalText,
          refinedText,
          resolve,
        };
        pendingRefineRef.current = pending;
        setPendingRefine(pending);
      });
    },
    []
  );

  const refineIfEnabled = useCallback(
    async (
      text: string,
      contextMessages: RefineContextMessage[],
      model: string
    ): Promise<PromptRefineResult> => {
      const trimmed = text.trim();
      if (!settings.promptRefineEnabled || !trimmed) {
        return "original";
      }

      const provider = resolveProviderForModel(model);
      if (!provider) {
        return "original";
      }

      const refined = await refinePrompt({
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        apiKeySource: provider.apiKeySource,
        apiKeyEnvVar: provider.apiKeyEnvVar,
        model,
        userPrompt: trimmed,
        contextMessages,
        labSettings: settings,
      });

      if (!refined || refined === trimmed) {
        return "original";
      }

      return showConfirmDialog(trimmed, refined);
    },
    [resolveProviderForModel, settings, showConfirmDialog]
  );

  const handleConfirmRefine = useCallback(
    (text: string) => {
      settlePendingRefine({
        type: "refined",
        text,
      });
    },
    [settlePendingRefine]
  );

  const handleCancelRefine = useCallback(() => {
    settlePendingRefine("cancelled");
  }, [settlePendingRefine]);

  const handleTimeoutRefine = useCallback(() => {
    settlePendingRefine("original");
  }, [settlePendingRefine]);

  const value = useMemo(
    () => ({
      refineIfEnabled,
    }),
    [refineIfEnabled]
  );

  return (
    <PromptRefineContext.Provider value={value}>
      {children}
      {pendingRefine ? (
        <PromptRefineDialog
          open
          originalText={pendingRefine.originalText}
          refinedText={pendingRefine.refinedText}
          onConfirm={handleConfirmRefine}
          onCancel={handleCancelRefine}
          onTimeout={handleTimeoutRefine}
        />
      ) : null}
    </PromptRefineContext.Provider>
  );
}

export function usePromptRefiner(): PromptRefineContextValue {
  const context = useContext(PromptRefineContext);

  if (!context) {
    throw new Error("usePromptRefiner must be used within PromptRefineProvider");
  }

  return context;
}
