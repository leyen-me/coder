import "./index.css";
import "katex/dist/katex.min.css";

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { initLocaleBeforeRender } from "@/lib/i18n/init-locale";
import { LocaleProvider } from "@/lib/i18n/locale-provider";
import { initThemeBeforeRender } from "@/lib/theme/init-theme";
import { ModelProviderProvider } from "@/lib/model-provider/model-provider-provider";
import { KeyboardShortcutsProvider } from "@/lib/keyboard-shortcuts/keyboard-shortcuts-provider";
import { WebToolsProvider } from "@/lib/web-tools/web-tools-provider";
import { ThemeProvider } from "@/lib/theme/theme-provider";
import { AgentStoreProvider } from "@/features/agent/store/agent-store";
import { WorkspaceProvider } from "@/features/workspace/workspace-provider";
import {
  initCoderStorageSync,
  initCoderStorageAsync,
} from "@/lib/storage/init";

initLocaleBeforeRender();
initThemeBeforeRender();
initCoderStorageSync();

// Wait for storage (settings from backend) before rendering React,
// so all components read the correct initial data.
initCoderStorageAsync().then(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <LocaleProvider>
        <ThemeProvider>
          <ModelProviderProvider>
            <KeyboardShortcutsProvider>
            <WebToolsProvider>
              <WorkspaceProvider>
                <AgentStoreProvider>
                  <TooltipProvider>
                    <App />
                  </TooltipProvider>
                </AgentStoreProvider>
              </WorkspaceProvider>
            </WebToolsProvider>
            </KeyboardShortcutsProvider>
          </ModelProviderProvider>
        </ThemeProvider>
      </LocaleProvider>
    </React.StrictMode>,
  );
});
