import "./index.css";

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { initLocaleBeforeRender } from "@/lib/i18n/init-locale";
import { LocaleProvider } from "@/lib/i18n/locale-provider";
import { initThemeBeforeRender } from "@/lib/theme/init-theme";
import { ModelProviderProvider } from "@/lib/model-provider/model-provider-provider";
import { ThemeProvider } from "@/lib/theme/theme-provider";
import { AgentStoreProvider } from "@/features/agent/store/agent-store";

initLocaleBeforeRender();
initThemeBeforeRender();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LocaleProvider>
      <ThemeProvider>
        <ModelProviderProvider>
          <AgentStoreProvider>
            <TooltipProvider>
              <App />
            </TooltipProvider>
          </AgentStoreProvider>
        </ModelProviderProvider>
      </ThemeProvider>
    </LocaleProvider>
  </React.StrictMode>,
);
