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
import { ScheduledJobStreamBridge } from "@/features/scheduled-jobs/components/scheduled-job-stream-bridge";
import { WorkspaceProvider } from "@/features/workspace/workspace-provider";
import {
  initCoderStorageSync,
  initCoderStorageAsync,
} from "@/lib/storage/init";

initCoderStorageSync();

// Load settings from ~/.coder/settings.json before first paint and React mount.
initCoderStorageAsync().then(() => {
  initLocaleBeforeRender();
  initThemeBeforeRender();

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <LocaleProvider>
        <ThemeProvider>
          <ModelProviderProvider>
            <KeyboardShortcutsProvider>
            <WebToolsProvider>
              <WorkspaceProvider>
                <AgentStoreProvider>
                  <ScheduledJobStreamBridge />
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
