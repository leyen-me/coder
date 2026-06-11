"use client";

import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { useMemo } from "react";

import { defineMonacoTheme } from "@/lib/monaco/get-monaco-theme";
import "@/lib/monaco/setup-monaco-environment";
import { useTheme } from "@/lib/theme/theme-provider";
import { cn } from "@/lib/utils";

loader.config({ monaco });

type MonacoPreviewEditorProps = {
  value: string;
  language: string;
  className?: string;
};

export function MonacoPreviewEditor({
  value,
  language,
  className,
}: MonacoPreviewEditorProps) {
  const { resolved } = useTheme();
  const theme = useMemo(() => defineMonacoTheme(monaco, resolved), [resolved]);

  return (
    <Editor
      beforeMount={(monacoApi) => {
        defineMonacoTheme(monacoApi, resolved);
      }}
      className={cn("min-h-0", className)}
      height="100%"
      language={language}
      loading={null}
      options={{
        automaticLayout: true,
        domReadOnly: true,
        folding: true,
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 13,
        hideCursorInOverviewRuler: true,
        lineNumbers: "on",
        minimap: { enabled: false },
        overviewRulerBorder: false,
        overviewRulerLanes: 0,
        padding: { top: 8, bottom: 8 },
        readOnly: true,
        renderLineHighlight: "line",
        scrollBeyondLastLine: false,
        scrollbar: {
          horizontalScrollbarSize: 10,
          verticalScrollbarSize: 10,
        },
        wordWrap: "off",
      }}
      theme={theme}
      value={value}
    />
  );
}
